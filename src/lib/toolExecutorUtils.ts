import type { ToolResult } from '../hooks/useToolExecutor'

/**
 * Build Python code for executing the analyze_data tool.
 * Generates code that handles single or multiple dataframes, chart detection,
 * and converts results to JSON format.
 *
 * @param escapedNames - Array of dataframe names already escaped for Python strings
 * @param escapedQuestion - Question string already escaped for Python strings
 * @returns Python code string ready to execute in Pyodide
 */
export function buildAnalyzeDataPythonCode(
  escapedNames: string[],
  escapedQuestion: string
): string {
  return `
import json
import os

df_names = ${JSON.stringify(escapedNames)}
question = "${escapedQuestion}"

# Ensure exports/charts directory exists before PandasAI tries to save charts
os.makedirs("exports/charts", exist_ok=True)

# Validate dataframes exist
missing = [name for name in df_names if name not in dataframes]
if missing:
    result_json = json.dumps({"success": False, "result": f"Dataframes not found: {missing}"})
elif len(df_names) == 0:
    result_json = json.dumps({"success": False, "result": "No dataframes specified"})
else:
    try:
        pandasai_obj = None
        if len(df_names) == 1:
            # Single dataframe - use SmartDataframe.chat() directly
            sdf = dataframes[df_names[0]]
            pandasai_obj = sdf
            print(f"Querying single dataframe: {df_names[0]}")
            result = sdf.chat(question)
        else:
            # Multiple dataframes - use Agent with raw DataFrames
            from pandasai import Agent
            raw_dfs = [dataframes[name]._df for name in df_names]
            print(f"Querying multiple dataframes: {df_names}")
            agent = Agent(raw_dfs, config={"llm": llm})
            pandasai_obj = agent
            result = agent.chat(question)
        
        # Extract executed code from PandasAI response
        executed_code = None
        if hasattr(result, 'last_code_executed') and result.last_code_executed:
            executed_code = result.last_code_executed
        elif hasattr(result, 'last_code_generated') and result.last_code_generated:
            # Fallback to last_code_generated if last_code_executed is not available
            executed_code = result.last_code_generated
        
        # Check if result is a path to a chart
        result_str = str(result)
        chart_path = None
        
        print(f"PandasAI result: {result_str[:200]}...")
        
        # Detect known generic error messages from PandasAI
        known_error_patterns = [
            "Unfortunately, I was not able to get your answer",
            "I was unable to answer your question",
            "Please try again",
        ]
        
        is_error_response = any(pattern in result_str for pattern in known_error_patterns)
        
        if is_error_response:
            # Try to extract more details from the PandasAI object and result
            error_details = []
            
            # Check for last_error attribute on pandasai_obj
            if hasattr(pandasai_obj, 'last_error') and pandasai_obj.last_error:
                error_details.append(f"Error: {pandasai_obj.last_error}")
            
            # Check for last_error on result object as well
            if hasattr(result, 'last_error') and result.last_error:
                error_details.append(f"Result error: {result.last_error}")
            
            # Check for last_prompt if available
            if hasattr(pandasai_obj, 'last_prompt') and pandasai_obj.last_prompt:
                error_details.append(f"Last prompt: {pandasai_obj.last_prompt[:500]}...")
            
            # Include the code that was attempted
            if executed_code:
                error_details.append("Code attempted:\\n" + str(executed_code))
            
            # Build detailed error message
            detailed_error = result_str
            if error_details:
                detailed_error += "\\n\\nDetails:\\n" + "\\n".join(error_details)
            
            result_json = json.dumps({
                "success": False,
                "result": detailed_error,
                "executedCode": executed_code
            })
        else:
            # PandasAI saves charts to exports/charts/ directory
            if result_str.endswith('.png') or result_str.endswith('.jpg') or result_str.endswith('.jpeg'):
                chart_path = result_str
            
            # Check if there's a recently created chart file
            if chart_path is None and os.path.exists("exports/charts"):
                import glob
                charts = glob.glob("exports/charts/*.png")
                if charts:
                    # Get the most recent chart
                    charts.sort(key=os.path.getmtime, reverse=True)
                    chart_path = charts[0]
                    print(f"Found chart: {chart_path}")
            
            # Convert chart to base64 data URL so browser can display it
            chart_data_url = None
            if chart_path and os.path.exists(chart_path):
                import base64
                with open(chart_path, 'rb') as f:
                    chart_bytes = f.read()
                chart_base64 = base64.b64encode(chart_bytes).decode('utf-8')
                chart_data_url = f"data:image/png;base64,{chart_base64}"
                print(f"Converted chart to data URL ({len(chart_base64)} chars)")
            
            result_json = json.dumps({
                "success": True,
                "result": result_str,
                "chartPath": chart_data_url,
                "executedCode": executed_code
            })
    except Exception as e:
        import traceback
        traceback.print_exc()
        result_json = json.dumps({"success": False, "result": f"Error: {str(e)}"})

result_json
`
}

/**
 * Parse the JSON result from Python tool execution.
 * Converts the JSON string to a ToolResult object, handling missing fields.
 *
 * @param resultJson - JSON string returned from Python execution
 * @returns Parsed ToolResult object
 */
export function parseToolExecutionResult(resultJson: string): ToolResult {
  const parsed = JSON.parse(resultJson)

  return {
    success: parsed.success ?? false,
    result: parsed.result ?? '',
    chartPath: parsed.chartPath || undefined,
    executedCode: parsed.executedCode || undefined,
  }
}


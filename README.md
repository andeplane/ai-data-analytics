# AI Data Analytics

An AI-powered data analysis tool that runs entirely in your browser. Upload CSV or JSON files and ask questions about your data using natural language. No backend required, no API keys needed - everything runs locally using Web-LLM and Pyodide.

Made by Anders Hafreager

## 🌟 Features

- **📁 File Upload**: Drag-and-drop or browse to upload CSV/JSON files
- **💬 Natural Language Queries**: Ask questions about your data in plain English
- **📊 Automatic Visualizations**: Generate charts, histograms, and plots automatically
- **🔗 Multi-Dataframe Support**: Load multiple datasets and join or compare them
- **🤖 Local AI Inference**: Uses Web-LLM (Hermes-3-Llama-3.1-8B) running entirely in your browser
- **🐍 Python in Browser**: PandasAI powered by Pyodide - full Python data analysis without a server
- **🔒 Privacy-First**: All data processing happens locally - your data never leaves your device

## 🚀 Live Demo

Visit the live application: [https://andeplane.github.io/ai-data-analytics/](https://andeplane.github.io/ai-data-analytics/)

## 🛠️ Technology Stack

- **Frontend**: React 19 + TypeScript
- **Build Tool**: Vite
- **Styling**: TailwindCSS
- **Python Runtime**: Pyodide (Python in the browser)
- **Data Analysis**: PandasAI
- **LLM**: @mlc-ai/web-llm (Hermes-3-Llama-3.1-8B-q4f16_1-MLC)
- **Charts**: Recharts

## 🏗️ Architecture

This application runs entirely client-side using several innovative technologies:

- **Pyodide**: Executes Python code in the browser, enabling PandasAI to run without a backend
- **Web-LLM**: Provides local LLM inference using WebGPU, eliminating the need for API keys
- **Custom WebLLM Bridge**: JavaScript-Python interop layer that allows PandasAI to call the local LLM
- **Function Calling**: Implements OpenAI-compatible function calling for tool-based interactions
- **Chart Generation**: PandasAI generates charts that are converted to base64 data URLs for display

## 📖 Usage

### Getting Started

1. **Load the Application**: Visit the live demo or run locally (see Development section)
2. **Wait for Initialization**: The app will automatically load:
   - Python runtime (Pyodide)
   - AI model (~5GB, cached after first load)
   - PandasAI library
3. **Upload Data**: Drag-and-drop a CSV or JSON file, or click to browse
4. **Ask Questions**: Type natural language questions about your data

### Example Queries

- "What's the average age in this dataset?"
- "Show me a bar chart of sales by region"
- "Find all records where price is greater than 100"
- "Compare the revenue between dataset1 and dataset2"
- "Create a histogram of the age distribution"
- "What are the top 10 products by sales?"

### Supported File Formats

- **CSV**: Standard comma-separated values files
- **JSON**: Array of objects or single object format

## 💻 Development

### Prerequisites

- Node.js 20 or higher
- npm or yarn

### Setup

1. Clone the repository:
```bash
git clone https://github.com/andeplane/ai-data-analytics.git
cd ai-data-analytics
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser to `http://localhost:5173`

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint

### Project Structure

```
src/
├── components/          # React components
│   ├── DataFrameList.tsx
│   ├── FileUpload.tsx
│   ├── LoadingOverlay.tsx
│   └── ResultsRenderer.tsx
├── hooks/              # Custom React hooks
│   ├── useLLMChat.ts   # Main chat orchestration
│   ├── usePandasAI.ts  # PandasAI integration
│   ├── usePyodide.ts   # Pyodide initialization
│   ├── useToolExecutor.ts  # Tool execution bridge
│   └── useWebLLM.ts    # Web-LLM engine management
├── lib/                # Core libraries
│   ├── pandasai-loader.py  # Python loader for PandasAI
│   ├── systemPrompt.ts     # Dynamic prompt builder
│   └── tools.ts            # Tool definitions
└── App.tsx             # Main application component
```

## 🚢 Deployment

This project is automatically deployed to GitHub Pages via GitHub Actions. The workflow:

1. Triggers on pushes to `main` branch
2. Builds the application using Vite
3. Deploys to GitHub Pages

To enable GitHub Pages:
1. Go to repository Settings > Pages
2. Under "Build and deployment", select **Source: GitHub Actions**

## 🔧 How It Works

1. **Initialization**: On page load, Pyodide loads Python runtime and Web-LLM downloads the AI model
2. **PandasAI Setup**: A custom Python loader patches PandasAI to work in Pyodide and bridges it to Web-LLM
3. **File Upload**: CSV/JSON files are parsed and loaded into PandasAI SmartDataframe objects
4. **Query Processing**: User queries are sent to the local LLM with function calling enabled
5. **Tool Execution**: When the LLM calls `analyze_data`, PandasAI processes the query and generates results
6. **Visualization**: Charts are generated by PandasAI, converted to base64, and displayed in the chat

## 📝 Notes

- **First Load**: The initial model download is ~5GB and may take several minutes depending on your connection
- **Browser Requirements**: Requires a modern browser with WebGPU support (Chrome/Edge 113+, Firefox 110+, Safari 18+)
- **Memory Usage**: The application uses significant browser memory (~2-4GB) due to the LLM model and Python runtime

## 📄 License

This project is open source. See LICENSE file for details.

## 🙏 Acknowledgments

- [PandasAI](https://github.com/gventuri/pandas-ai) - AI-powered data analysis
- [Pyodide](https://pyodide.org/) - Python runtime for the browser
- [Web-LLM](https://github.com/mlc-ai/web-llm) - Local LLM inference
- [Vite](https://vitejs.dev/) - Fast build tool
- [React](https://react.dev/) - UI framework

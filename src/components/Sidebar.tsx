import { useSidebarViewModel, type SidebarViewModelProps } from '../hooks/useSidebarViewModel'
import { SidebarHeader } from './SidebarHeader'
import { DataFrameList } from './DataFrameList'
import { FileUpload } from './FileUpload'
import type { DataFrame } from '../hooks/useDataframes'

export interface SidebarProps extends SidebarViewModelProps {
  /** Full dataframe objects for the list display */
  dataframesForList: DataFrame[]
  /** Handler for file uploads */
  onFileLoad: (name: string, content: string, type: 'csv' | 'json') => Promise<void>
}

/**
 * Application sidebar containing:
 * - Header with status and model loading progress
 * - List of loaded dataframes
 * - File upload area
 */
export function Sidebar({
  dataframesForList,
  onFileLoad,
  ...viewModelProps
}: SidebarProps) {
  const viewModel = useSidebarViewModel(viewModelProps)

  return (
    <aside className="w-72 border-r border-zinc-800 flex flex-col">
      {/* Header */}
      <SidebarHeader
        systemStatus={viewModel.systemStatus}
        webllmStatus={viewModel.webllmStatus}
        webllmProgress={viewModel.webllmProgress}
        webllmProgressText={viewModel.webllmProgressText}
        elapsedTime={viewModel.elapsedTime}
        estimatedTimeRemaining={viewModel.estimatedTimeRemaining}
        pandasStatus={viewModel.pandasStatus}
        pandasError={viewModel.pandasError}
        onRetryPandas={viewModel.onRetryPandas}
        onNewConversation={viewModel.onNewConversation}
      />

      {/* DataFrames List */}
      <div className="flex-1 p-4 overflow-y-auto">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          DataFrames ({dataframesForList.length})
        </h2>
        <DataFrameList
          dataframes={dataframesForList}
          activeDataframe={null}
          onSelect={() => {}}
          onRemove={viewModel.onRemoveDataframe}
        />
      </div>

      {/* File Upload */}
      <div className="p-4 border-t border-zinc-800">
        <FileUpload onFileLoad={onFileLoad} />
      </div>
    </aside>
  )
}


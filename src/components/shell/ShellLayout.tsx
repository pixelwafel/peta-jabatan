import React, { useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Toolbar } from './Toolbar';
import { OpdListSidebar } from './OpdListSidebar';
import { StructurePanel } from './StructurePanel';
import { RightSidebar } from './RightSidebar';
import { StatusBar } from './StatusBar';
import { Toast } from '../common/Toast';
import { usePanelWidths } from '@/hooks/usePanelWidths';

const InnerShellLayout: React.FC = () => {
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const { leftWidth, rightWidth, dragLeftTo, dragRightTo } = usePanelWidths();

  const rightColumnWidth = rightCollapsed ? '36px' : `${rightWidth}px`;

  return (
    <div
      className="shell-grid"
      style={
        {
          '--left-width': `${leftWidth}px`,
          '--right-width': rightColumnWidth,
        } as React.CSSProperties
      }
    >
      {/* Top Toolbar (Grid row 1, col span 3) */}
      <div className="col-span-3">
        <Toolbar />
      </div>

      {/* Main Row (Grid row 2): Kolom 1 daftar OPD, Kolom 2 struktur (outline/preview/unplaced/recap), Kolom 3 properti.
          Kolom 1 & 3 bisa ditarik-ulur (ResizeHandle di tepinya, lihat usePanelWidths) — kolom 2 selalu 1fr. */}
      <OpdListSidebar width={leftWidth} onResizeDrag={dragLeftTo} />
      <StructurePanel />
      <RightSidebar
        collapsed={rightCollapsed}
        onToggleCollapse={() => setRightCollapsed(!rightCollapsed)}
        width={rightWidth}
        onResizeDrag={dragRightTo}
      />

      {/* Bottom Status bar (Grid row 3, col span 3) */}
      <div className="col-span-3">
        <StatusBar />
      </div>

      <Toast />
    </div>
  );
};

export const ShellLayout: React.FC = () => {
  return (
    <ReactFlowProvider>
      <InnerShellLayout />
    </ReactFlowProvider>
  );
};

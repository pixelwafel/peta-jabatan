import React, { useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Toolbar } from './Toolbar';
import { OpdListSidebar } from './OpdListSidebar';
import { StructurePanel } from './StructurePanel';
import { RightSidebar } from './RightSidebar';
import { StatusBar } from './StatusBar';
import { Toast } from '../common/Toast';

const InnerShellLayout: React.FC = () => {
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const rightWidth = rightCollapsed ? '36px' : '380px';

  return (
    <div
      className="shell-grid"
      style={
        {
          '--right-width': rightWidth,
        } as React.CSSProperties
      }
    >
      {/* Top Toolbar (Grid row 1, col span 3) */}
      <div className="col-span-3">
        <Toolbar />
      </div>

      {/* Main Row (Grid row 2): Kolom 1 daftar OPD, Kolom 2 struktur (outline/preview/unplaced/recap), Kolom 3 properti */}
      <OpdListSidebar />
      <StructurePanel />
      <RightSidebar collapsed={rightCollapsed} onToggleCollapse={() => setRightCollapsed(!rightCollapsed)} />

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

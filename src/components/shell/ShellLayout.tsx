import React, { useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Toolbar } from './Toolbar';
import { LeftSidebar } from './LeftSidebar';
import { RightSidebar } from './RightSidebar';
import { StatusBar } from './StatusBar';
import { Canvas } from '../canvas/Canvas';

const InnerShellLayout: React.FC = () => {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const leftWidth = leftCollapsed ? '36px' : '280px';
  const rightWidth = rightCollapsed ? '36px' : '320px';

  return (
    <div
      className="shell-grid"
      style={
        {
          '--left-width': leftWidth,
          '--right-width': rightWidth,
        } as React.CSSProperties
      }
    >
      {/* Top Toolbar (Grid row 1, col span 3) */}
      <div className="col-span-3">
        <Toolbar />
      </div>

      {/* Main Row (Grid row 2): Left sidebar, Canvas, Right panel */}
      <LeftSidebar collapsed={leftCollapsed} onToggleCollapse={() => setLeftCollapsed(!leftCollapsed)} />
      <Canvas />
      <RightSidebar collapsed={rightCollapsed} onToggleCollapse={() => setRightCollapsed(!rightCollapsed)} />

      {/* Bottom Status bar (Grid row 3, col span 3) */}
      <div className="col-span-3">
        <StatusBar />
      </div>
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

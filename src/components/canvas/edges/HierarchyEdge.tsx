import React, { memo } from 'react';
import { BaseEdge, EdgeProps, getSmoothStepPath } from '@xyflow/react';

export const HierarchyEdge: React.FC<EdgeProps> = memo(function HierarchyEdge(props) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style } = props;

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  return (
    <BaseEdge
      path={edgePath}
      style={{
        stroke: '#64748b', // Slate 500
        strokeWidth: 1.5,
        ...style,
      }}
    />
  );
});

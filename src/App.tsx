import React, { useEffect, useState } from 'react';
import { ShellLayout } from './components/shell/ShellLayout';
import { ExportDialog } from './components/dialogs/ExportDialog';
import { useProjectStore } from './store/projectStore';

export const App: React.FC = () => {
  const [showExportModal, setShowExportModal] = useState(false);
  const undo = useProjectStore(s => s.undo);
  const redo = useProjectStore(s => s.redo);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      if (isCmdOrCtrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        // Prevent undo when typing inside inputs
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
        e.preventDefault();
        undo();
      } else if (
        (isCmdOrCtrl && e.key.toLowerCase() === 'y') ||
        (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
        e.preventDefault();
        redo();
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setShowExportModal(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return (
    <>
      <ShellLayout />
      {showExportModal && <ExportDialog onClose={() => setShowExportModal(false)} />}
    </>
  );
};

export default App;

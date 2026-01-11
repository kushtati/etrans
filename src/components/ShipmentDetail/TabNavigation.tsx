import React from 'react';

interface TabNavigationProps {
  visibleTabs: string[];
  activeTab: 'timeline' | 'docs' | 'finance';
  onTabChange: (tab: 'timeline' | 'docs' | 'finance') => void;
}

/**
 * TabNavigation: Floating pill tabs for switching between Timeline, Docs, and Finance
 */
export const TabNavigation: React.FC<TabNavigationProps> = ({
  visibleTabs,
  activeTab,
  onTabChange
}) => {
  // Keyboard navigation between tabs
  const handleKeyDown = (e: React.KeyboardEvent, currentTab: string) => {
    const currentIndex = visibleTabs.indexOf(currentTab);
    
    if (e.key === 'ArrowLeft' && currentIndex > 0) {
      e.preventDefault();
      onTabChange(visibleTabs[currentIndex - 1] as any);
    } else if (e.key === 'ArrowRight' && currentIndex < visibleTabs.length - 1) {
      e.preventDefault();
      onTabChange(visibleTabs[currentIndex + 1] as any);
    } else if (e.key === 'Home') {
      e.preventDefault();
      onTabChange(visibleTabs[0] as any);
    } else if (e.key === 'End') {
      e.preventDefault();
      onTabChange(visibleTabs[visibleTabs.length - 1] as any);
    }
  };

  return (
    <div className="px-6 -mt-6 sticky top-28 z-10">
      <div 
        className="bg-white p-1.5 rounded-2xl shadow-lg shadow-slate-200/50 flex justify-between border border-slate-100"
        role="tablist"
        aria-label="Onglets de détail du dossier"
      >
        {visibleTabs.map((tab) => {
          const label = tab === 'timeline' ? 'Suivi' : tab === 'docs' ? 'Docs' : 'Compta';
          return (
            <button 
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`panel-${tab}`}
              aria-label={`Onglet ${label}`}
              tabIndex={activeTab === tab ? 0 : -1}
              onClick={() => onTabChange(tab as any)}
              onKeyDown={(e) => handleKeyDown(e, tab)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${activeTab === tab ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

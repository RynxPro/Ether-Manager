const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src');

const fileMoves = {
  // Modals
  './ApplyPresetModal': '../components/modals/ApplyPresetModal',
  './CreatePresetModal': '../components/modals/CreatePresetModal',
  './CreatorProfileModal': '../components/modals/CreatorProfileModal',
  './InstallModal': '../components/modals/InstallModal',
  './OnboardingModal': '../components/modals/OnboardingModal',
  './PresetDetailModal': '../components/modals/PresetDetailModal',
  './ConfirmDialog': '../components/modals/ConfirmDialog',
  './ImageLightbox': '../components/modals/ImageLightbox',
  
  // Character
  './CharacterCard': '../components/character/CharacterCard',
  './CharacterDetailGrid': '../components/character/CharacterDetailGrid',
  './CharacterDetailHeader': '../components/character/CharacterDetailHeader',
  './CharacterDetailStats': '../components/character/CharacterDetailStats',
  
  // Mod Card
  './GbModCard': '../components/mod-card/GbModCard',
  './LibraryModCard': '../components/mod-card/LibraryModCard',
  './UpdateBadge': '../components/mod-card/UpdateBadge',
  
  // Views
  './ModDetailPage': '../views/ModDetailPage',
  './CreatorProfilePage': '../views/CreatorProfilePage',
  './SettingsPage': '../views/SettingsPage',
};

const viewsFileMoves = {
  // Modals
  '../components/ApplyPresetModal': '../components/modals/ApplyPresetModal',
  '../components/CreatePresetModal': '../components/modals/CreatePresetModal',
  '../components/CreatorProfileModal': '../components/modals/CreatorProfileModal',
  '../components/InstallModal': '../components/modals/InstallModal',
  '../components/OnboardingModal': '../components/modals/OnboardingModal',
  '../components/PresetDetailModal': '../components/modals/PresetDetailModal',
  '../components/ConfirmDialog': '../components/modals/ConfirmDialog',
  '../components/ImageLightbox': '../components/modals/ImageLightbox',
  
  // Character
  '../components/CharacterCard': '../components/character/CharacterCard',
  '../components/CharacterDetailGrid': '../components/character/CharacterDetailGrid',
  '../components/CharacterDetailHeader': '../components/character/CharacterDetailHeader',
  '../components/CharacterDetailStats': '../components/character/CharacterDetailStats',
  
  // Mod Card
  '../components/GbModCard': '../components/mod-card/GbModCard',
  '../components/LibraryModCard': '../components/mod-card/LibraryModCard',
  '../components/UpdateBadge': '../components/mod-card/UpdateBadge',
  
  // Views
  '../components/ModDetailPage': './ModDetailPage',
  '../components/CreatorProfilePage': './CreatorProfilePage',
  '../components/SettingsPage': './SettingsPage',
};

// Also we need to fix imports inside the moved files.
// For files moved from `src/components` to `src/components/modals`:
// Old: `import { X } from './ConfirmDialog'` 
// New: `import { X } from './ConfirmDialog'` (if both in modals)
// Old: `import { X } from '../lib/utils'`
// New: `import { X } from '../../lib/utils'`

function processDirectory(dir, depth = 0) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath, depth + 1);
    } else if (fullPath.endsWith('.jsx') || fullPath.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let originalContent = content;
      
      const inViews = fullPath.includes('/src/views/');
      const inComponentsRoot = fullPath.includes('/src/components/') && !fullPath.includes('/modals/') && !fullPath.includes('/character/') && !fullPath.includes('/mod-card/') && !fullPath.includes('/layout/') && !fullPath.includes('/ui/');
      const inModals = fullPath.includes('/src/components/modals/');
      const inCharacter = fullPath.includes('/src/components/character/');
      const inModCard = fullPath.includes('/src/components/mod-card/');
      
      // Global replacements (from root components to subfolders)
      if (inComponentsRoot || fullPath.includes('/src/layout/') || fullPath.includes('/src/ui/') || fullPath.includes('/src/App.jsx')) {
         // Replace exact imports like `./GbModCard` -> `./mod-card/GbModCard`
         // or `../components/GbModCard` -> `../components/mod-card/GbModCard`
      }
      
      // A safer way is to just use a huge regex replacer for any import
      
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (line.trim().startsWith('import') || line.includes('import(')) {
          
          // Fix imports from src/views
          if (inViews) {
             for (const [oldPath, newPath] of Object.entries(viewsFileMoves)) {
                line = line.replace(new RegExp(`['"]${oldPath}['"]`), `'${newPath}'`);
             }
             // Fix relative imports to other root components
             // Old: import X from './SearchableDropdown' -> New: import X from '../components/SearchableDropdown'
             line = line.replace(/['"]\.\/([^'"]+)['"]/, (match, p1) => {
                // If it's another view, keep it './'
                if (['ModDetailPage', 'CreatorProfilePage', 'SettingsPage', 'BrowseView', 'LibraryView', 'PresetsView', 'SupportView', 'CharacterDetail'].includes(p1)) {
                   return `'./${p1}'`;
                }
                // If it's a moved component, point to its new folder
                for (const [oldC, newC] of Object.entries(fileMoves)) {
                   if (oldC === `./${p1}`) {
                      return `'${newC}'`;
                   }
                }
                // Otherwise it's a root component
                return `'../components/${p1}'`;
             });
             
             // Fix ../store, ../lib etc. No change needed because src/components and src/views are siblings!
          }
          
          // Fix imports from src/components/modals, character, mod-card
          if (inModals || inCharacter || inModCard) {
             // Fix parent references
             // Old: `../lib/utils` -> New: `../../lib/utils`
             line = line.replace(/['"]\.\.\/lib\/([^'"]+)['"]/, "'../../lib/$1'");
             line = line.replace(/['"]\.\.\/store\/([^'"]+)['"]/, "'../../store/$1'");
             line = line.replace(/['"]\.\.\/hooks\/([^'"]+)['"]/, "'../../hooks/$1'");
             line = line.replace(/['"]\.\.\/icons\/([^'"]+)['"]/, "'../../icons/$1'");
             line = line.replace(/['"]\.\.\/gameConfig['"]/, "'../../gameConfig'");
             
             // Fix sibling references
             // Old: `./SearchableDropdown` -> New: `../SearchableDropdown`
             line = line.replace(/['"]\.\/([^'"]+)['"]/, (match, p1) => {
                // Wait, what if it imports another component that was ALSO moved to the SAME folder?
                let targetFolder = '';
                if (inModals) targetFolder = 'modals';
                if (inCharacter) targetFolder = 'character';
                if (inModCard) targetFolder = 'mod-card';
                
                let targetWasMoved = false;
                let targetMovedToFolder = '';
                for (const [oldC, newC] of Object.entries(fileMoves)) {
                   if (oldC === `./${p1}`) {
                      targetWasMoved = true;
                      targetMovedToFolder = newC.split('/')[2]; // '../components/modals/X' -> 'modals'
                   }
                }
                
                if (targetWasMoved && targetMovedToFolder === targetFolder) {
                   return `'./${p1}'`; // Stay in same folder
                } else if (targetWasMoved) {
                   return `'../${targetMovedToFolder}/${p1}'`;
                } else {
                   return `'../${p1}'`; // Root component
                }
             });
             
             // Fix ../views references
             line = line.replace(/['"]\.\.\/views\/([^'"]+)['"]/, "'../../views/$1'");
          }
          
          // Fix imports from src/components root and layout/ui
          if (inComponentsRoot || fullPath.includes('/src/components/layout/') || fullPath.includes('/src/components/ui/') || fullPath.includes('/src/components/dev/')) {
             for (const [oldPath, newPath] of Object.entries(fileMoves)) {
                // If we are in layout/ui, `./` is actually `../` for root components
                if (fullPath.includes('/layout/') || fullPath.includes('/ui/') || fullPath.includes('/dev/')) {
                   const oldP = oldPath.replace('./', '../');
                   let newP = newPath.replace('../components/', '../');
                   if (newP.startsWith('../views/')) {
                      newP = '../../views/' + newP.split('/').pop();
                   }
                   line = line.replace(new RegExp(`['"]${oldP}['"]`), `'${newP}'`);
                } else {
                   line = line.replace(new RegExp(`['"]${oldPath}['"]`), `'${newPath}'`);
                }
             }
          }
          
          // App.jsx
          if (fullPath.endsWith('/src/App.jsx')) {
             for (const [oldPath, newPath] of Object.entries(fileMoves)) {
                const oldP = oldPath.replace('./', './components/');
                let newP = newPath.replace('../components/', './components/');
                newP = newP.replace('../views/', './views/');
                line = line.replace(new RegExp(`['"]${oldP}['"]`), `'${newP}'`);
             }
          }
        }
        lines[i] = line;
      }
      
      content = lines.join('\n');
      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content);
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

processDirectory(srcDir);

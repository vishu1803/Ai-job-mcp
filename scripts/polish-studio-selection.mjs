// One-time narrow recovery-safe patch; retained for audit of the frontend consolidation.
import fs from 'node:fs/promises';
const file = new URL('../public/js/resume-studio.client.js', import.meta.url);
const source = await fs.readFile(file, 'utf8');
const start = source.indexOf('  function renderModularDrawer() {');
const end = source.indexOf(
  '  // =========================================================================\n  // Slice 1: Deterministic Analysis Engine Integration',
  start
);
if (start < 0 || end < 0) throw Error('Expected selection function boundaries missing');
const replacement = `  function renderModularDrawer() {
    if (!modularDrawerContent || !currentDraft) return;
    modularDrawerContent.replaceChildren();
    const overview=document.createElement('p');
    overview.textContent=activeSelection.experienceIds.size+' roles, '+activeSelection.projectIds.size+' projects and '+activeSelection.skillIds.size+' skills included. Your source records stay unchanged.';
    modularDrawerContent.append(overview);
    for(const [section,key,selector] of [['experience','experienceIds','.rs-toggle-exp'],['projects','projectIds','.rs-toggle-proj']]){
      currentDraft.structuredResume[section].forEach((item,index)=>{
        const node=nodesByPath.get(section+'.'+index);if(!node)return;
        const button=document.createElement('button');button.type='button';button.className='rs-btn rs-selection-jump';
        button.textContent=(activeSelection[key].has(node.nodeId)?'Included: ':'Excluded: ')+(item.name||[item.title,item.company].filter(Boolean).join(' at '));
        button.addEventListener('click',()=>{closeAllDrawers();const field=structuredEditorContainer.querySelector(selector+'[data-node-id="'+node.nodeId+'"]');field?.scrollIntoView({block:'center',behavior:'smooth'});field?.focus({preventScroll:true});});
        modularDrawerContent.append(button);
      });
    }
  }

`;
await fs.writeFile(file, source.slice(0, start) + replacement + source.slice(end));

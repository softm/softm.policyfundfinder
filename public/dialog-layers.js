// The notice remains mounted under the viewer, including its scroll and focus.
export function createDialogLayers(parent,viewer,{onViewerClose=()=>{},onParentClose=()=>{}}={}){
  let opener=null,viewerActive=false;
  function finishViewer(restoreFocus=true){
    if(!viewerActive)return;
    viewerActive=false;onViewerClose();viewer.innerHTML='';
    const target=opener;opener=null;
    if(restoreFocus&&parent.open&&target?.isConnected)target.focus({preventScroll:true});
  }
  function closeViewer(restoreFocus=true){
    if(viewer.open)viewer.close();
    finishViewer(restoreFocus);
  }
  function closeParent(){
    closeViewer(false);
    if(parent.open)parent.close();
  }
  function openViewer(markup,className,trigger){
    if(!parent.open)return;
    closeViewer(false);opener=trigger;viewerActive=true;
    viewer.className=className;viewer.innerHTML=markup;viewer.scrollTop=0;viewer.showModal();
  }
  function backdrop(target,close){
    target.addEventListener('click',event=>{
      if(event.target!==target)return;
      const rect=target.getBoundingClientRect();
      if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();
    });
  }
  viewer.addEventListener('cancel',event=>{event.preventDefault();closeViewer();});
  viewer.addEventListener('close',()=>{if(!viewer.open)finishViewer();});
  parent.addEventListener('cancel',event=>{event.preventDefault();if(viewer.open)closeViewer();else closeParent();});
  parent.addEventListener('close',()=>{if(!parent.open){closeViewer(false);onParentClose();}});
  backdrop(viewer,closeViewer);backdrop(parent,closeParent);
  return {openViewer,closeViewer,closeParent};
}

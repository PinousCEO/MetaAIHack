const {contextBridge, ipcRenderer, webUtils} = require('electron');
contextBridge.exposeInMainWorld('depth', Object.freeze({
  request: (route, body) => ipcRenderer.invoke('api', route, body),
  chooseProject: () => ipcRenderer.invoke('choose-project'),
  projectFromDrop: async files => {
    if(!Array.isArray(files)||files.length!==1)throw Error('Drop one project at a time.');
    const paths=files.map(file=>webUtils.getPathForFile(file));
    if(paths.some(path=>!path))throw Error('Drop a local project folder from File Explorer.');
    return ipcRenderer.invoke('project-drop-paths',paths);
  },
  initial: () => ipcRenderer.invoke('initial'),
  runtime: (action, payload) => ipcRenderer.invoke('runtime', action, payload),
  onRuntime: callback => { const listener=(_event,state)=>callback(state);ipcRenderer.on('runtime-state',listener);return ()=>ipcRenderer.removeListener('runtime-state',listener); },
  onRuntimeSelection: callback => { const listener=(_event,selection)=>callback(selection);ipcRenderer.on('runtime-selection',listener);return ()=>ipcRenderer.removeListener('runtime-selection',listener); },
  onRuntimeFrame: callback => { const listener=(_event,frame)=>callback(frame);ipcRenderer.on('runtime-frame',listener);return ()=>ipcRenderer.removeListener('runtime-frame',listener); },
  onRuntimeHighlight: callback => { const listener=(_event,sources)=>callback(sources);ipcRenderer.on('runtime-highlight',listener);return ()=>ipcRenderer.removeListener('runtime-highlight',listener); },
  onRuntimeIndexChanged: callback => { const listener=(_event,state)=>callback(state);ipcRenderer.on('runtime-index-changed',listener);return ()=>ipcRenderer.removeListener('runtime-index-changed',listener); },
  window: action => ipcRenderer.invoke('window', action)
}));

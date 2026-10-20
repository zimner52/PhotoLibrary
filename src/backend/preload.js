const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // 图库
  getImageList: () => ipcRenderer.invoke('get-image-list'),
  addImages: () => ipcRenderer.invoke('add-images'),
  importManifest: () => ipcRenderer.invoke('import-manifest'),
  updateImageTags: (payload) => ipcRenderer.invoke('update-image-tags', payload),
  deleteImage: (id) => ipcRenderer.invoke('delete-image', id),
  confirm: (options) => ipcRenderer.invoke('confirm', options),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // 文件夹
  getFolders: () => ipcRenderer.invoke('get-folders'),
  createFolder: (name) => ipcRenderer.invoke('create-folder', name),
  renameFolder: (payload) => ipcRenderer.invoke('rename-folder', payload),
  deleteFolder: (name) => ipcRenderer.invoke('delete-folder', name),
  setImageFolder: (payload) => ipcRenderer.invoke('set-image-folder', payload),
  openPath: (path) => ipcRenderer.invoke('open-path', path),

  // 保存目录 / 打包
  getImageRoot: () => ipcRenderer.invoke('get-image-root'),
  changeImageRoot: () => ipcRenderer.invoke('change-image-root'),
  exportZip: (scope) => ipcRenderer.invoke('export-zip', scope),
  openImage: (target) => ipcRenderer.invoke('open-image', target),

  // 自动导入（监听下载目录）
  getConfig: () => ipcRenderer.invoke('get-config'),
  chooseWatchDir: () => ipcRenderer.invoke('choose-watch-dir'),
  setWatchEnabled: (enabled) => ipcRenderer.invoke('set-watch-enabled', enabled),
  rescanWatchDir: () => ipcRenderer.invoke('rescan-watch-dir'),

  // 主进程推送图库更新，返回取消订阅函数
  onImagesUpdated: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('images-updated', listener)
    return () => ipcRenderer.removeListener('images-updated', listener)
  },

  // 后台抓到下载来源后推送
  onImageSourceUpdated: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('image-source-updated', listener)
    return () => ipcRenderer.removeListener('image-source-updated', listener)
  },

  // 按索引批量下载的进度
  onDownloadProgress: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('download-progress', listener)
    return () => ipcRenderer.removeListener('download-progress', listener)
  },
})

'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const invocar = (canal) => (...args) => ipcRenderer.invoke(canal, ...args);

contextBridge.exposeInMainWorld('api', {
  ajustes: {
    obtener: invocar('ajustes:obtener'),
    actualizar: invocar('ajustes:actualizar'),
    guardarApiKey: invocar('ajustes:guardarApiKey'),
    borrarApiKey: invocar('ajustes:borrarApiKey'),
  },
  eventos: {
    listar: invocar('eventos:listar'),
    crear: invocar('eventos:crear'),
  },
  vision: {
    leer: invocar('vision:leer'),
  },
  cartones: {
    duplicado: invocar('cartones:duplicado'),
    guardar: invocar('cartones:guardar'),
    listar: invocar('cartones:listar'),
    buscarFolio: invocar('cartones:buscarFolio'),
  },
  carpeta: {
    elegir: invocar('carpeta:elegir'),
    listar: invocar('carpeta:listar'),
    leer: invocar('carpeta:leer'),
    alCambiar: (fn) => {
      const h = () => fn();
      ipcRenderer.on('carpeta:cambio', h);
      return () => ipcRenderer.removeListener('carpeta:cambio', h);
    },
  },
});

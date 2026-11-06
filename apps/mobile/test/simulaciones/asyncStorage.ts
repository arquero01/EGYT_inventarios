// Almacenamiento del celular simulado en memoria, para las pruebas.
const datos = new Map<string, string>();

export default {
  getItem: async (clave: string) => datos.get(clave) ?? null,
  setItem: async (clave: string, valor: string) => {
    datos.set(clave, valor);
  },
  removeItem: async (clave: string) => {
    datos.delete(clave);
  },
  clear: async () => datos.clear(),
};

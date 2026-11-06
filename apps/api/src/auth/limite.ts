/**
 * Límite de intentos en memoria (por ejemplo, 10 ingresos fallidos cada 15
 * minutos por correo y por dirección IP). Suficiente para un solo servidor;
 * si algún día hay varios, habría que moverlo a la base de datos.
 */
export class LimiteIntentos {
  private readonly registros = new Map<string, { cuenta: number; desde: number }>();

  constructor(
    private readonly maximo: number,
    private readonly ventanaMs: number,
    private readonly ahora: () => number = Date.now,
  ) {}

  /** true si la llave ya agotó sus intentos en la ventana actual. */
  bloqueado(llave: string): boolean {
    const r = this.vigente(llave);
    return r !== undefined && r.cuenta >= this.maximo;
  }

  registrar(llave: string): void {
    const r = this.vigente(llave);
    if (r) r.cuenta++;
    else this.registros.set(llave, { cuenta: 1, desde: this.ahora() });
    if (this.registros.size > 10_000) this.limpiar();
  }

  reiniciar(llave: string): void {
    this.registros.delete(llave);
  }

  private vigente(llave: string) {
    const r = this.registros.get(llave);
    if (r && this.ahora() - r.desde >= this.ventanaMs) {
      this.registros.delete(llave);
      return undefined;
    }
    return r;
  }

  private limpiar() {
    for (const llave of [...this.registros.keys()]) this.vigente(llave);
  }
}

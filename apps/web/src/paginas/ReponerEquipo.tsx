import { NOMBRE_TIPO_EQUIPO, type TipoEquipo } from '@egt/domain';
import { useState, type FormEvent } from 'react';
import { nuevoId } from '../api.ts';
import { hoy } from '../formato.ts';
import { useFormulario, useLectura, useSesion } from '../ganchos.ts';
import type { EquipoEnLista, HojaDeVida } from '../tipos.ts';
import { Aviso, Boton, Cajon, Campo, ErrorFormulario } from '../ui/componentes.tsx';

/**
 * Reposición: cambiarle al usuario el equipo que falló (casi siempre una
 * batería) por otro que está en stock. El que falla va a mantenimiento o
 * garantía (o de baja) y el nuevo queda instalado al mismo usuario.
 */

const BATERIAS: TipoEquipo[] = ['BATERIA_GEL', 'BATERIA_LITIO'];

export function ReponerEquipo({ hoja, alCerrar, alTerminar }: { hoja: HojaDeVida; alCerrar: () => void; alTerminar: (mensaje: string) => void }) {
  const f = useFormulario();
  const sesion = useSesion();
  const e = hoja.equipo;
  const usuario = hoja.instalacionActual!.usuarioFinal;
  // Batería por batería (gel o litio); los demás, del mismo tipo.
  const tipos = BATERIAS.includes(e.tipo) ? BATERIAS : [e.tipo];
  const [tipo, setTipo] = useState<TipoEquipo>(e.tipo);
  const [busqueda, setBusqueda] = useState('');
  const [nuevo, setNuevo] = useState<EquipoEnLista | null>(null);
  const [destino, setDestino] = useState<'MANTENIMIENTO' | 'BAJA'>('MANTENIMIENTO');
  const [motivo, setMotivo] = useState('');
  const [fecha, setFecha] = useState(hoy());
  const [tecnico, setTecnico] = useState(sesion?.usuario.nombre ?? '');

  const consulta = new URLSearchParams({ estado: 'EN_STOCK', tipo, porPagina: '50', ...(busqueda.trim() ? { q: busqueda.trim() } : {}) });
  const disponibles = useLectura<{ datos: EquipoEnLista[]; paginacion: { total: number } }>(`/equipos?${consulta}`);

  const guardar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!nuevo) {
      f.limpiar();
      f.fijarError('equipoNuevoId', 'Elija el equipo que se le entrega al usuario');
      return;
    }
    const r = await f.enviar('REPONER_EQUIPO', {
      equipoRetiradoId: e.id,
      equipoNuevoId: nuevo.id,
      instalacionId: nuevoId(),
      destino,
      motivo,
      fecha,
      tecnico,
    });
    if (r) {
      alTerminar(
        `Reposición registrada: ${usuario.nombre} ahora tiene ${nuevo.serial}, y ${e.serial} quedó ${destino === 'BAJA' ? 'de baja' : 'en mantenimiento'}. Cuando ${e.serial} llegue a bodega, regístrelo con una guía de devolución.`,
      );
    }
  };

  return (
    <Cajon
      titulo="Reponer por falla"
      descripcion={
        <>
          Cambiarle a {usuario.nombre} (C.C. {usuario.cedula}) el equipo <span className="serial">{e.serial}</span> por otro que esté en stock.
        </>
      }
      alCerrar={alCerrar}
    >
      <form className="formulario" onSubmit={guardar} noValidate>
        <ErrorFormulario mensaje={f.mensaje ?? null} errores={f.errores} visibles={['equipoNuevoId', 'destino', 'motivo', 'fecha', 'tecnico']} />

        <fieldset className="grupo-edicion">
          <legend>Equipo nuevo que se entrega</legend>
          {tipos.length > 1 ? (
            <div className="opciones-radio" role="radiogroup" aria-label="Tipo de equipo nuevo">
              {tipos.map((t) => (
                <label key={t}>
                  <input
                    type="radio"
                    name="tipo-nuevo"
                    checked={tipo === t}
                    onChange={() => {
                      setTipo(t);
                      setNuevo(null);
                    }}
                  />
                  {NOMBRE_TIPO_EQUIPO[t]}
                </label>
              ))}
            </div>
          ) : null}
          <Campo etiqueta="Buscar en stock" valor={busqueda} alCambiar={setBusqueda} marcador="Serial, código, marca o bodega" autocompletar="off" />
          {f.errorDe('equipoNuevoId') ? <span className="error">{f.errorDe('equipoNuevoId')}</span> : null}
          <div className="lista-elegir" role="radiogroup" aria-label="Equipo nuevo">
            {disponibles.cargando && !disponibles.datos ? <p className="suave">Buscando…</p> : null}
            {disponibles.datos && disponibles.datos.datos.length === 0 ? (
              <p className="suave">No hay {NOMBRE_TIPO_EQUIPO[tipo].toLowerCase()} en stock{busqueda ? ' con esa búsqueda' : ''}.</p>
            ) : null}
            {disponibles.datos?.datos.map((x) => (
              <label key={x.id} className={nuevo?.id === x.id ? 'elegido' : undefined}>
                <input type="radio" name="equipo-nuevo" checked={nuevo?.id === x.id} onChange={() => setNuevo(x)} />
                <span>
                  <span className="serial">{x.serial}</span>
                  <span className="secundaria">
                    {[x.marca, x.modelo].filter(Boolean).join(' ') || x.descripcion || NOMBRE_TIPO_EQUIPO[x.tipo]}
                    {x.bodega ? ` · ${x.bodega.nombre}` : ' · en campo'}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {disponibles.datos && disponibles.datos.paginacion.total > disponibles.datos.datos.length ? (
            <p className="suave" style={{ margin: 0, fontSize: 'var(--t-s)' }}>
              Se muestran {disponibles.datos.datos.length} de {disponibles.datos.paginacion.total}: busque por serial para encontrar uno en particular.
            </p>
          ) : null}
        </fieldset>

        <fieldset className="grupo-edicion">
          <legend>El equipo que falla ({e.serial})</legend>
          <div className="opciones-radio" role="radiogroup" aria-label="Qué pasa con el equipo que falla">
            <label>
              <input type="radio" name="destino" checked={destino === 'MANTENIMIENTO'} onChange={() => setDestino('MANTENIMIENTO')} />
              Va a mantenimiento o garantía
            </label>
            <label>
              <input type="radio" name="destino" checked={destino === 'BAJA'} onChange={() => setDestino('BAJA')} />
              Se da de baja (no tiene arreglo)
            </label>
          </div>
          <Campo etiqueta="Falla que presenta" valor={motivo} alCambiar={setMotivo} error={f.errorDe('motivo')} marcador="Por ejemplo: no retiene carga" />
        </fieldset>

        <div className="rejilla-campos">
          <Campo etiqueta="Fecha del cambio" tipo="date" valor={fecha} alCambiar={setFecha} error={f.errorDe('fecha')} />
          <Campo etiqueta="Técnico" valor={tecnico} alCambiar={setTecnico} error={f.errorDe('tecnico')} />
        </div>

        {destino === 'BAJA' ? <Aviso tipo="atencion">Dar de baja es definitivo: el equipo ya no se podrá usar ni modificar.</Aviso> : null}

        <div className="pie-formulario">
          <Boton tipo="submit" cargando={f.enviando}>
            Registrar reposición
          </Boton>
          <Boton variante="secundario" onClick={alCerrar}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Cajon>
  );
}

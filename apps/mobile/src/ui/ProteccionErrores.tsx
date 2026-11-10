import { Component, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Boton } from './componentes.tsx';
import { color, espacio } from './tema.ts';

/**
 * Si una pantalla falla al dibujarse (por ejemplo, por un dato que el
 * servidor manda vacío), la app ya no se cierra sola: muestra el problema y
 * deja volver al inicio. El mensaje sirve para reportar la falla.
 */
export class ProteccionErrores extends Component<{ children: ReactNode }, { error: Error | null; intento: number }> {
  state = { error: null as Error | null, intento: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Pantalla con error:', error);
  }

  render() {
    if (!this.state.error) return <View key={this.state.intento} style={{ flex: 1 }}>{this.props.children}</View>;
    return (
      <ScrollView style={{ flex: 1, backgroundColor: color.fondo }} contentContainerStyle={{ padding: espacio.xl, paddingTop: 80, gap: espacio.l }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: color.texto }}>Algo falló en esta pantalla</Text>
        <Text style={{ fontSize: 15, color: color.textoSuave }}>
          La app sigue funcionando y sus operaciones pendientes no se perdieron. Toque «Volver al inicio». Si se repite, tome una captura de este
          mensaje y envíela a la oficina.
        </Text>
        <Text selectable style={{ fontSize: 13, color: color.peligro, fontFamily: 'monospace' }}>
          {this.state.error.message}
        </Text>
        <Boton texto="Volver al inicio" icono="home-outline" alTocar={() => this.setState((s) => ({ error: null, intento: s.intento + 1 }))} />
      </ScrollView>
    );
  }
}

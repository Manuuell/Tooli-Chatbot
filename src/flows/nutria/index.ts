import { getNutriaSession } from './shared';
import {
  handleNutriaInicio,
  handleNutriaConsentimiento,
  handleNutriaRechazado,
  handleNutriaCapturaPantalla,
  handleNutriaEdad,
  handleNutriaEdadTexto,
  handleNutriaGenero,
  handleNutriaTiempoCelular,
  handleNutriaVerificarMetricas,
  handleNutriaTiempoRedes,
  handleNutriaRedPrincipal,
  handleNutriaRedPrincipalTexto,
  handleNutriaSabeUltra,
  handleNutriaVioPublicidad,
  handleNutriaRedPublicidad,
  handleNutriaPublicidadMotivo,
  handleNutriaConsumoBebidas,
  handleNutriaConsumoPanaderia,
  handleNutriaConsumoPostres,
  handleNutriaConsumoMecatos,
  handleNutriaComproDespues,
  handleNutriaSellos,
  handleNutriaConsomiriaSello,
  handleNutriaMotivacion,
  handleNutriaMotivacionTexto,
  handleNutriaComoEntero,
  handleNutriaComoEnteroTexto,
  handleNutriaContacto,
  handleNutriaCompletada,
} from './survey';

type Handler = (ctx: { from: string; text: string; session: any; _inbound?: any }) => Promise<void>;

const HANDLERS: Record<string, Handler> = {
  nutria_consentimiento:     handleNutriaConsentimiento,
  nutria_rechazado:          handleNutriaRechazado,
  nutria_captura_pantalla:   handleNutriaCapturaPantalla,
  nutria_edad:               handleNutriaEdad,
  nutria_edad_texto:         handleNutriaEdadTexto,
  nutria_genero:             handleNutriaGenero,
  nutria_tiempo_celular:     handleNutriaTiempoCelular,
  nutria_verificar_metricas: handleNutriaVerificarMetricas,
  nutria_tiempo_redes:       handleNutriaTiempoRedes,
  nutria_red_principal:      handleNutriaRedPrincipal,
  nutria_red_principal_texto:handleNutriaRedPrincipalTexto,
  nutria_sabe_ultra:         handleNutriaSabeUltra,
  nutria_vio_publicidad:     handleNutriaVioPublicidad,
  nutria_red_publicidad:     handleNutriaRedPublicidad,
  nutria_publicidad_motivo:  handleNutriaPublicidadMotivo,
  nutria_consumo_bebidas:    handleNutriaConsumoBebidas,
  nutria_consumo_panaderia:  handleNutriaConsumoPanaderia,
  nutria_consumo_postres:    handleNutriaConsumoPostres,
  nutria_consumo_mecatos:    handleNutriaConsumoMecatos,
  nutria_compro_despues:     handleNutriaComproDespues,
  nutria_sellos:             handleNutriaSellos,
  nutria_consomiria_sello:   handleNutriaConsomiriaSello,
  nutria_motivacion:         handleNutriaMotivacion,
  nutria_motivacion_texto:   handleNutriaMotivacionTexto,
  nutria_como_entero:        handleNutriaComoEntero,
  nutria_como_entero_texto:  handleNutriaComoEnteroTexto,
  nutria_contacto:           handleNutriaContacto,
  nutria_completada:         handleNutriaCompletada,
};

export async function handleNutriaMessage(from: string, text: string, inbound?: any): Promise<void> {
  const session = await getNutriaSession(from);
  const step    = session?.step ?? 'nutria_inicio';

  const handler = HANDLERS[step] ?? handleNutriaInicio;

  await handler({ from, text, session, _inbound: inbound });
}

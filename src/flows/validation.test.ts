import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, isMenuCommand, CODIGO_REGEX, CEDULA_REGEX, EMAIL_REGEX } from './validation';

/**
 * Estas cuatro cosas deciden qué hace el bot con lo que escribe un estudiante:
 * si lo saca de un flujo, si intenta entrar al portal con ese código o si le
 * manda un código de verificación a un correo. Equivocarse acá no lanza ningún
 * error: simplemente el bot deja de entender a la gente, o le abre la puerta a
 * quien no debía.
 */
describe('normalize', () => {
  it('quita las tildes, que la gente escribe indistintamente', () => {
    assert.equal(normalize('MENÚ'), 'menu');
    assert.equal(normalize('Información'), 'informacion');
  });

  it('también pliega la eñe, y para lo que se usa está bien', () => {
    // NFD descompone la ñ en n + tilde combinante, así que el filtro de
    // diacríticos se la lleva: 'Año' → 'ano'. No es un descuido a corregir:
    // normalize solo sirve para reconocer comandos ('menu', 'salir', 'asesor'),
    // ninguno con eñe, y plegarla ayuda a quien escribe sin teclado español.
    // Queda anotado por si algún día se usa para comparar nombres o programas,
    // donde sí importaría la diferencia.
    assert.equal(normalize('Año'), 'ano');
  });

  it('recorta espacios de los extremos y pasa a minúscula', () => {
    assert.equal(normalize('  ASESOR  '), 'asesor');
  });
});

describe('isMenuCommand', () => {
  it('reconoce "menu" escrito como sea', () => {
    for (const forma of ['menu', 'MENU', 'Menú', ' menú ', 'MENÚ']) {
      assert.ok(isMenuCommand(forma), `no reconoció "${forma}"`);
    }
  });

  it('no se dispara con un mensaje que apenas contiene la palabra', () => {
    // Si bastara con contenerla, "quiero ver el menu de posgrados" sacaría a la
    // persona del flujo en el que está en vez de responderle.
    assert.ok(!isMenuCommand('quiero ver el menu de posgrados'));
    assert.ok(!isMenuCommand('menús'));
  });
});

describe('CODIGO_REGEX (código estudiantil)', () => {
  it('acepta el formato real: T y ocho dígitos', () => {
    assert.ok(CODIGO_REGEX.test('T00012345'));
  });

  it('acepta la T en minúscula, que es como la escribe medio mundo', () => {
    assert.ok(CODIGO_REGEX.test('t00012345'));
  });

  it('rechaza longitudes distintas y otros prefijos', () => {
    assert.ok(!CODIGO_REGEX.test('T0001234'));      // siete dígitos
    assert.ok(!CODIGO_REGEX.test('T000123456'));    // nueve
    assert.ok(!CODIGO_REGEX.test('A00012345'));     // otra letra
    assert.ok(!CODIGO_REGEX.test('00012345'));      // sin letra
  });

  it('no acepta un código válido escondido dentro de otro texto', () => {
    assert.ok(!CODIGO_REGEX.test('mi codigo es T00012345 gracias'));
  });
});

describe('CEDULA_REGEX', () => {
  it('acepta de 6 a 12 dígitos', () => {
    assert.ok(CEDULA_REGEX.test('123456'));
    assert.ok(CEDULA_REGEX.test('123456789012'));
  });

  it('rechaza fuera de ese rango y con cualquier carácter que no sea dígito', () => {
    assert.ok(!CEDULA_REGEX.test('12345'));
    assert.ok(!CEDULA_REGEX.test('1234567890123'));
    assert.ok(!CEDULA_REGEX.test('12.345.678'));
  });
});

describe('EMAIL_REGEX (correo institucional)', () => {
  it('acepta los dos dominios de la universidad', () => {
    assert.ok(EMAIL_REGEX.test('juan.perez@utb.edu.co'));
    assert.ok(EMAIL_REGEX.test('juan.perez@utbvirtual.edu.co'));
    assert.ok(EMAIL_REGEX.test('JUAN@UTB.EDU.CO'));
  });

  it('rechaza correos de fuera de la universidad', () => {
    // Es la barrera de la verificación por OTP: con un correo ajeno, cualquiera
    // podría pedir el código de verificación a una dirección que controla.
    assert.ok(!EMAIL_REGEX.test('juan@gmail.com'));
    assert.ok(!EMAIL_REGEX.test('juan@outlook.com'));
  });

  it('no se deja engañar por dominios que solo se parecen', () => {
    assert.ok(!EMAIL_REGEX.test('juan@utb.edu.co.atacante.com'));
    assert.ok(!EMAIL_REGEX.test('juan@notutb.edu.co'));
    assert.ok(!EMAIL_REGEX.test('juan@utb.edu.co '));
  });
});

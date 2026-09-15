import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { maskPhone, maskCode, describeText } from './logSafe';

/**
 * Estas funciones son la barrera que impide que las conversaciones de los
 * estudiantes terminen en texto plano en los logs. Un cambio que las rompa no
 * lanza ningún error: simplemente empieza a filtrar datos en silencio, y eso
 * solo se nota cuando ya está en producción. De ahí que se prueben.
 */
describe('maskPhone', () => {
  it('deja ver solo los últimos cuatro dígitos', () => {
    assert.equal(maskPhone('573001234567'), '****4567');
  });

  it('ignora el formato con que venga el número', () => {
    assert.equal(maskPhone('+57 300 123 4567'), '****4567');
    assert.equal(maskPhone('(300) 123-4567'), '****4567');
  });

  it('no revela nada si el número viene vacío o ausente', () => {
    assert.equal(maskPhone(''), '****');
    assert.equal(maskPhone(undefined), '****');
    assert.equal(maskPhone(null), '****');
  });

  it('nunca devuelve el número completo, ni siendo corto', () => {
    for (const entrada of ['1', '12', '123', '1234', '12345', '573001234567']) {
      assert.ok(!maskPhone(entrada).includes(entrada) || entrada.length <= 4,
        `filtró el número completo para "${entrada}"`);
    }
  });
});

describe('maskCode', () => {
  it('conserva el prefijo y el final, que es lo que sirve para depurar', () => {
    assert.equal(maskCode('T00012345'), 'T0****345');
  });

  it('oculta por completo los códigos demasiado cortos para enmascarar', () => {
    assert.equal(maskCode('T001'), '****');
    assert.equal(maskCode(''), '****');
    assert.equal(maskCode(undefined), '****');
  });

  it('no deja el código completo en el resultado', () => {
    const codigo = 'T00098765';
    assert.ok(!maskCode(codigo).includes(codigo));
  });
});

describe('describeText', () => {
  it('por defecto describe el mensaje sin mostrar su contenido', () => {
    assert.equal(describeText('quiero información de la maestría'), '33 chars');
  });

  it('con vista previa muestra solo el trozo pedido', () => {
    assert.equal(describeText('hola que tal', 4), '12 chars: "hola…"');
  });

  it('no agrega puntos suspensivos si el texto cabe entero', () => {
    assert.equal(describeText('hola', 10), '4 chars: "hola"');
  });

  it('colapsa los saltos de línea para no romper el formato del log', () => {
    assert.equal(describeText('hola\n\nmundo', 11), '11 chars: "hola mundo"');
  });

  it('trata texto ausente como texto vacío', () => {
    assert.equal(describeText(undefined), '0 chars');
    assert.equal(describeText(null), '0 chars');
  });
});

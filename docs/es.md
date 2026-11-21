# Karotz

Controle su conejo Karotz desde Gladys, en local: voz, sonidos y radios web,
LED, orejas, cámara, sueño y etiquetas RFID. Sin cuenta, sin nube.

## Antes de empezar

- Su Karotz debe ejecutar uno de estos sistemas:
  - **Terrier OS** ([guía de instalación](https://terrier.cyberloutre.fr/karotz)),
    construido sobre LapinLibre. Es la opción más segura: wifi WPA3, SSH solo
    con clave, una página web protegida por contraseña;
  - **[LapinLibre](https://github.com/sweetlilmre/LapinLibre)**, un sistema
    libre para el Karotz, compilado desde sus fuentes;
  - **OpenKarotz**, sobre el firmware original o sobre
    [Free Rabbits OS](https://www.freerabbits.nl/fros/) (solo WPA2).

  Los tres ofrecen la misma API local, la de OpenKarotz: la integración los
  controla de la misma forma. Comprobación rápida: abra
  `http://<dirección-del-conejo>/` en un navegador, debe ver la página web del
  conejo.

- El conejo y Gladys deben estar en la **misma red local**.
- Dé al conejo una **dirección IP fija** (Free Rabbits OS solo admite eso de
  todos modos), o resérvela en su router.

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. Introduzca la **dirección del conejo**: su dirección IP (p. ej.
   `192.168.1.70`) o su nombre de host. Varios conejos: sepárelos con comas.
3. **LapinLibre o Terrier OS**: introduzca la **contraseña web**, la que pide
   la página web del conejo (usuario `admin`). Terrier OS la escribe en
   `web-password.txt` en su memoria USB de instalación. Varios conejos con
   contraseñas distintas: sepárelas con espacios. Deje el campo vacío para
   OpenKarotz.
4. Guarde y abra la pestaña **Descubrimiento**: aparece el conejo, junto con su
   cámara. Añádalos.

¿No conoce su dirección? Un Karotz no se anuncia en la red, pero la integración
puede buscarlo. Pulse **Buscar en mi red**, sin escribir
nada: Gladys localiza su red local gracias a los dispositivos que se anuncian
en ella (router, televisor, NAS…), y después la integración pregunta a sus 254
direcciones y lista los conejos que han respondido. Copie la dirección
encontrada en el campo y guarde.

La búsqueda nunca envía su contraseña a los dispositivos de la red. Un conejo
con LapinLibre o Terrier OS protegido por contraseña aparece por tanto aparte,
como una dirección que «pide una contraseña»: añádala y use después **Probar la
conexión**.

Si no se ha podido determinar la red, el botón se lo indica: introduzca
entonces los tres primeros números de sus direcciones locales (p. ej.
`192.168.1`) en el campo **Red local** y repita la búsqueda.

Los demás ajustes:

- **Intervalo de actualización** — cada cuánto se consulta el conejo (60 s por
  defecto). Un Karotz es una máquina pequeña: no sirve de nada bajar mucho más.
- **Voz por defecto** — el identificador de voz que usa el conejo al hablar,
  tal como aparece en la página web del Karotz (en los firmwares recientes, un
  número). Vacío: la voz por defecto del propio conejo.
- **Cámara** — añade un dispositivo de cámara por conejo.

## Dispositivos

Cada conejo se convierte en un dispositivo, reconocido por su dirección MAC:
conserva su historial, sus escenas y sus paneles si cambia su dirección IP.

| Función                     | Lo que puede hacer                     |
| --------------------------- | -------------------------------------- |
| Despierto                   | despertar o dormir al conejo           |
| LED, color del LED          | encender, apagar, elegir el color      |
| Pulsación del LED           | luz fija o pulsante                    |
| Oreja izquierda / derecha   | posición de 0 a 16                     |
| Volumen                     | de 0 a 100 %, si su firmware lo ofrece |
| Almacenamiento, memoria USB | porcentaje usado                       |
| Etiquetas RFID              | número de etiquetas registradas        |
| Cámara (dispositivo aparte) | una foto reciente bajo demanda         |

## Botones de la configuración

- **Probar la conexión** — consulta cada conejo y muestra su versión y su
  estado.
- **Buscar en mi red** — véase más arriba.
- **Identificar un conejo** — el conejo elegido parpadea en azul y mueve las
  orejas durante unos segundos.
- **Reiniciar un conejo** — vuelve al cabo de un minuto aproximadamente.

Un éxito se muestra en verde, un error en rojo.

## Escenas

La integración añade sus propias tarjetas al editor de escenas (Gladys 5.1 o
posterior).

**Acciones**

- **Hacer hablar al conejo** — una frase, con la voz que elija. Puede usar en
  ella variables de la escena.
- **Reproducir un sonido o una radio** — el identificador de un sonido
  guardado en el conejo, o la dirección `http://` de un MP3 o de una radio web.
- **Detener la radio**.
- **Reproducir un estado de ánimo** — al azar, o por su número.
- **Decir la hora**.
- **Ajustar el LED** — color en hexadecimal (`FF0000` para rojo), fijo o
  pulsante, con un segundo color y una velocidad.
- **Mover las orejas** — a una posición, al azar, o de vuelta al reposo.
- **Tomar una foto** — se convierte en la imagen del dispositivo de cámara:
  continúe con la acción de Gladys «enviar la imagen de una cámara» para
  recibirla.

Despertar, dormir, encender el LED: son funciones del dispositivo, use la
acción estándar «Controlar un dispositivo».

**Disparadores**

- **Conejo inaccesible** / **Conejo accesible de nuevo**.
- **Conejo dormido o despierto** — cuando cambia de estado por sí mismo
  (página web del conejo, programación interna), no cuando lo ordena Gladys.
- **Nueva etiqueta RFID registrada** — con el identificador, el nombre y el
  color de la etiqueta como variables.

## Widgets del panel

- **Karotz** — estado del conejo, almacenamiento, número de etiquetas y cuatro
  botones: hablar (se abre un pequeño formulario), estado de ánimo, decir la
  hora, dormir. Cuando duerme, un solo botón: despertarlo.
- **Cámara del Karotz** — la última foto, un botón para tomar una nueva y otro
  para borrar las fotos guardadas en el conejo.

Con varios conejos, elija cuál mostrar en los ajustes del widget.

## Límites

- **Pasar una etiqueta RFID delante del conejo no dispara ninguna escena.**
  OpenKarotz reacciona a una etiqueta llamando a una dirección web desde el
  conejo, y una integración de Gladys no puede ser llamada de esa forma. El
  disparador disponible se refiere al registro de una etiqueta _nueva_.
- **Con OpenKarotz, cada foto se queda en el conejo**, cuyo almacenamiento es
  pequeño. Bórrelas de vez en cuando con el botón del widget de cámara. Con
  LapinLibre y Terrier OS, el conejo guarda las 10 últimas en memoria y las
  olvida al reiniciarse.
- **Un conejo dormido rechaza** LED, orejas, sonidos y voz: despiértelo primero
  (en una escena, empiece por la acción «Controlar un dispositivo»).
- La voz depende del servicio de síntesis configurado en su conejo, que
  necesita Internet: si el conejo deja de hablar, pruebe desde su página web.
  Con LapinLibre y Terrier OS, ese servidor se configura en `lapinlibre.txt`
  (`SERVER=` o `TTS_SERVER=`): sin él, el conejo se niega a hablar y la
  integración se lo indica.
- **La API del conejo habla HTTP simple**, sea cual sea su sistema. Con
  LapinLibre y Terrier OS, la contraseña web viaja por tanto legible por su red
  local: el WPA3 la protege en el wifi, no en el cable entre el router y
  Gladys. Mantenga el conejo en una red de confianza.
- **Un Karotz con Terrier OS sigue siendo un conejo de Le Terrier**: Le Terrier
  y Gladys pueden controlarlo a la vez. Si ambos le hablan en el mismo
  instante, responde que está ocupado: inténtelo de nuevo.

## Solución de problemas

- **«Sin respuesta»** — ¿está encendido el conejo? ¿Se abre su
  página web desde un ordenador de la misma red? ¿Ha cambiado su dirección?
- **«Pide una contraseña web»** — el conejo ejecuta LapinLibre o Terrier OS:
  introduzca la contraseña de su página web en la configuración.
- **«Contraseña web rechazada»** — ninguna de las contraseñas introducidas es
  la correcta. Compruébela abriendo la página web del conejo (usuario `admin`).
- **«El conejo está ocupado»** — otra orden, de Le Terrier por ejemplo, lo
  estaba usando en ese instante: inténtelo de nuevo.
- **El conejo no aparece en Descubrimiento** — debe haber respondido al menos
  una vez: use **Probar la conexión**.
- **No hay función Volumen** — su firmware no tiene ese ajuste; es lo normal en
  el OpenKarotz original y en LapinLibre.

No afiliado a Violet, Mindscape, OpenKarotz, Free Rabbits, LapinLibre ni Le
Terrier.

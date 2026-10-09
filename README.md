# Prisma

## Contexto del proyecto

Prisma es una aplicación de escritorio gratuita y de código abierto cuyo objetivo es reducir
los procesos repetitivos del desarrollo de software **sin quitarle al desarrollador el control
sobre el código**.

Prisma no pretende reemplazar la programación manual. La idea es automatizar y facilitar las
operaciones repetitivas y tediosas (crear la estructura de un proyecto, generar archivos base,
organizar el trabajo) para que el desarrollador pueda concentrarse en la lógica real de su
proyecto, que sigue escribiéndose de forma manual y tradicional.

El proyecto está pensado como una herramienta extensible que en el futuro podría trabajar con
diferentes tecnologías y procesos de desarrollo.

## Problema que busca resolver

El desarrollo de software incluye una cantidad importante de tareas mecánicas que se repiten en
cada proyecto nuevo: crear la estructura de carpetas, generar archivos base, escribir el mismo
contenido inicial, conectar unos archivos con otros. Estas tareas no aportan valor por sí mismas,
pero consumen tiempo y son una fuente común de errores.

Prisma nace de la necesidad de reducir esas tareas repetitivas manteniendo siempre el control
manual del código. La herramienta existe para aliviar el trabajo mecánico, no para sustituir al
desarrollador ni para imponer una forma única de construir software.

## Tecnologías actuales

- **Tauri 2** — shell de la aplicación de escritorio.
- **Rust** — lógica de negocio y acceso al sistema de archivos.
- **React 19** — interfaz de usuario.
- **TypeScript** — tipado del frontend.
- **Vite** — servidor de desarrollo y empaquetado del frontend.
- **CSS** — estilos, sin frameworks ni librerías de componentes.
- **tauri-plugin-opener** — apertura de enlaces y archivos en el programa del sistema.
- **tauri-plugin-dialog** — selectores nativos de carpeta.
- **Monaco Editor** — editor de código del workspace (HTML, CSS, JavaScript, JSON y texto plano).

## Arquitectura general

- **React** se encarga de la interfaz: pantallas, componentes, estado de la vista y formularios.
  No realiza operaciones directas sobre el sistema de archivos.
- **TypeScript** define los tipos compartidos entre la interfaz y los datos que devuelve Rust.
- **Tauri** actúa como puente entre el frontend y el sistema operativo: expone los comandos de
  Rust a React y gestiona la ventana de escritorio y los permisos.
- **Rust** ejecuta todas las operaciones que requieren acceso al sistema de archivos (crear
  carpetas, escribir y leer archivos, listar contenido) y devuelve estructuras de datos
  serializables a la interfaz.

Flujo típico de una operación:

```
React (componente) -> hook (useProject / useWorkspace) -> servicio (services/projects.ts) -> invoke -> comando Rust -> sistema de archivos
```

El servicio `src/services/projects.ts` es el **único** punto del frontend que conoce los nombres
de los comandos de Rust. Si mañana se añaden nuevos comandos, deben añadirse ahí.

### Estructura del código

```
src/
├── App.tsx                     # raíz de la interfaz: decide qué pantalla mostrar
├── components/
│   ├── StartScreen.tsx         # pantalla inicial
│   ├── CreateProjectDialog.tsx # formulario de creación de proyecto
│   ├── ui/                     # piezas de interfaz reutilizables del workspace
│   │   ├── Modal.tsx           # base de los diálogos (foco, Escape, clic fuera)
│   │   ├── PromptDialog.tsx    # diálogo de texto: nuevo archivo, carpeta, renombrar
│   │   ├── ConfirmDialog.tsx   # diálogo de confirmación: eliminar
│   │   ├── CloseProjectDialog.tsx # guardar todo / descartar / cancelar al cerrar
│   │   └── ErrorBoundary.tsx   # pantalla de error si React se rompe
│   └── workspace/              # workspace de edición de un proyecto abierto
│       ├── Workspace.tsx       # estructura general, acciones, atajos y diálogos
│       ├── FileTree.tsx        # árbol de archivos: selección, teclado y menú contextual
│       ├── CodeEditor.tsx      # Monaco con carga diferida y modelo por archivo
│       ├── AnalysisPanel.tsx   # panel lateral de análisis del proyecto abierto
│       └── SearchOverlay.tsx   # apertura rápida (Ctrl+P) y búsqueda (Ctrl+Shift+F)
├── analysis/                   # M2.1.0: análisis de solo lectura, TypeScript puro y sin IO
│   ├── types.ts                # FileModel, ProjectModel y los contratos del análisis
│   ├── scan.ts                 # archivos del escaneo a modelo, tipos y grupos
│   ├── refs.ts                 # resolución de rutas relativas dentro del proyecto
│   ├── warnings.ts             # lista de avisos con identificador y tope por documento
│   ├── document.ts             # documento: elementos, texto y avisos de un HTML/Blade
│   ├── styles.ts               # índice de hojas, reglas por elemento y asociaciones
│   ├── analyze.ts              # orquestación del análisis y avisos del recorrido
│   ├── scan.test.ts            # pruebas de archivos, grupos y clasificación
│   ├── refs.test.ts            # pruebas de referencias relativas
│   ├── document.test.ts        # pruebas de documentos y avisos
│   ├── styles.test.ts          # pruebas del índice de estilos
│   └── analyze.test.ts         # pruebas del análisis completo
├── editor/
│   └── monacoEnvironment.ts    # workers de Monaco empaquetados por Vite
├── designer/                   # M2.0.0: modelo visual interno, sin interfaz ni IO
│   ├── types.ts                # PrismaNode, DesignDocument y contratos del modelo
│   ├── identity.ts             # identidad interna `element-001`, propia de Prisma
│   ├── tree.ts                 # construcción, jerarquía, orden, consultas y serialización
│   ├── html.ts                 # etiquetas HTML conocidas, void, de texto plano y componentes
│   ├── parse.ts                # lector mínimo de HTML y Blade
│   ├── styles.ts               # modelos de hoja de estilo, regla, declaración y coincidencia
│   ├── selector.ts             # selectores, especificidad y relación elemento/CSS
│   ├── css.ts                  # lector mínimo de CSS
│   ├── classify.ts             # clasificación de archivos y plan del proyecto
│   ├── tree.test.ts            # pruebas del árbol, la identidad y los atributos
│   ├── parse.test.ts           # pruebas del lector de HTML y Blade
│   ├── styles.test.ts          # pruebas de CSS, selectores y coincidencias
│   └── classify.test.ts        # pruebas de clasificación de archivos
├── hooks/
│   ├── useProject.ts           # ciclo de vida del proyecto: crear, abrir, ejecutar, cerrar
│   ├── useWorkspace.ts         # búferes, pestañas, guardado, búsqueda y operaciones de archivos
│   └── useAnalysis.ts          # escaneo y análisis del proyecto abierto, con reanálisis
├── services/
│   ├── projects.ts             # invocación de comandos Rust de proyectos y archivos
│   └── session.ts              # lectura, escritura y borrado de la sesión guardada
├── workspace/
│   ├── state.ts                # lógica pura de pestañas y sesión, sin React
│   └── state.test.ts           # pruebas de esa lógica con el runner de Node
├── styles/
│   ├── global.css              # reset, variables CSS y botones compartidos
│   ├── ui.css                  # diálogos y pantalla de error
│   └── App.css                 # layout raíz
└── types/
    ├── project.ts              # tipos ProjectInfo, ProjectNode, ProjectFile, ScannedFile y SearchMatch
    ├── session.ts              # tipos RunTarget, SessionState y SessionTab
    └── node-test.d.ts          # declaraciones mínimas de node:test y node:assert

src-tauri/src/
├── lib.rs                      # registro de plugins y comandos
├── main.rs                     # punto de entrada
├── projects.rs                 # comandos de proyectos, archivos y ejecución externa
└── session.rs                  # persistencia de la sesión en la carpeta de configuración
```

## Sistema de módulos y versiones

El desarrollo de Prisma se organiza en **módulos** y **versiones**:

- **Módulo**: una etapa importante del desarrollo, con un objetivo propio. Por ejemplo,
  "Proyectos web" o "Editor de código".
- **Versión (submódulo)**: un avance, una funcionalidad o una integración concreta dentro de
  un módulo. Se escribe como `M<n>.<n>.<n>`, por ejemplo `M1.0.0`. Cada versión tiene un objetivo
  acotado y verificable.
- **Corrección**: un arreglo sobre una versión ya existente. Se anota como `M<n>.<n>.<n>.<n>`,
  por ejemplo `M1.0.1`.

No debe convertirse cada pequeña tarea en un módulo independiente. Las mejoras internas que no
aportan funcionalidad se registran en el historial de versiones sin abrir una versión nueva.

### Módulos definidos

| Módulo | Nombre | Estado |
| ------ | ------ | ------ |
| 0 | Base técnica | Completado |
| 1 | Proyectos web | En desarrollo (`M1.0.0` a `M1.5.0` completadas) |
| 2 | Diseñador visual | En desarrollo (`M2.0.0`, `M2.1.0`, `M2.2.0` y `M2.2.1` completadas) |

## Historial de versiones

### Módulo 0 — Base técnica (completado)

- Proyecto Tauri funcional con ventana de escritorio.
- React + TypeScript + Vite configurados y funcionando.
- Rust funcionando y comunicándose con la interfaz.
- Pantalla inicial de Prisma con nombre, descripción y acciones principales.

### Módulo 1 — Proyectos web

#### M1.0.0 — Creación y apertura básica de proyectos web (completada)

Alcance implementado:

- **Crear proyecto web**
  - Formulario para introducir el nombre del proyecto.
  - Selector nativo de carpeta para elegir la ubicación.
  - Validación del nombre: no vacío, sin caracteres de ruta ni caracteres no permitidos, sin
    terminar en punto o espacio, y sin duplicar una carpeta existente.
  - Creación física de la carpeta del proyecto.
  - Generación de `index.html`, `style.css` y `script.js`.
  - `index.html` enlaza `style.css` mediante `<link>` y `script.js` mediante `<script>`, y
    contiene el mensaje `Hello World!`.
  - El proyecto creado queda registrado como el proyecto actualmente abierto.

- **Abrir proyecto**
  - Selección de una carpeta existente mediante selector nativo.
  - Reconocimiento de archivos web por extensión: `.html`/`.htm`, `.css`, `.js`/`.mjs`.
  - La comparación de extensiones no distingue mayúsculas y minúsculas.
  - Muestra del proyecto abierto con su nombre, ruta y los archivos web reconocidos agrupados por
    tipo.

No implementado en `M1.0.0` (fuera de alcance): edición del contenido de los archivos, editor
Monaco, diseñador visual, drag and drop, preview integrado, proyectos anidados o recursivos,
Laravel, PHP, Vue, Flutter, bases de datos, Git, terminal, plugins, autenticación, nube e IA.

#### M1.1.0 — Workspace básico de edición de proyectos web (completada)

Alcance implementado:

- **Workspace**
  - Al abrir o crear un proyecto, Prisma muestra un workspace en lugar de la lista de tarjetas.
  - Cabecera con el nombre de la aplicación, el botón `Ejecutar` y `Cerrar proyecto`.
  - Panel lateral con el árbol de archivos y panel central con el editor.
  - Barra de estado inferior con el archivo activo, los errores y el estado de guardado.

- **Árbol de archivos**
  - Muestra los archivos y carpetas reales encontrados dentro del proyecto.
  - Recorre subcarpetas hasta 8 niveles de profundidad.
  - Ordena carpetas antes que archivos, y ambos de forma alfabética.
  - Identifica el lenguaje de cada archivo: HTML, CSS, JavaScript, JSON y texto plano.
  - Marca visualmente el archivo seleccionado.
  - Los archivos de tipo no reconocido por el editor aparecen desactivados y no se pueden abrir.
  - Las entradas que empiezan por `.` (por ejemplo `.git`) se omiten del árbol.

- **Editor**
  - Monaco Editor, con resaltado de sintaxis y servicios de lenguaje para HTML, CSS y JavaScript
    (también JSON y texto plano).
  - Al seleccionar un archivo se lee su contenido **real** desde el disco.
  - El contenido se mantiene en un búfer en memoria por archivo, de forma que cambiar de archivo
    no pierde las ediciones pendientes.

- **Edición y guardado**
  - El usuario puede modificar el código directamente en el editor.
  - Botón `Guardar` y atajo `Ctrl + S` (o `Cmd + S`).
  - Al guardar, el contenido se escribe en el archivo real del disco mediante Rust.
  - Los archivos modificados y no guardados se marcan con `*` en el árbol y en la barra de estado,
    que indica `Sin guardar` o `Guardado`.

- **Ejecución**
  - El botón `Ejecutar` localiza el `index.html` del proyecto y lo abre en el navegador
    predeterminado del sistema mediante Rust (`tauri-plugin-opener`).
  - El botón aparece desactivado si el proyecto no tiene `index.html`.
  - No hay navegador interno, ni preview, ni `iframe`.

- **Cierre de proyecto**
  - `Cerrar proyecto` limpia el búfer y el estado del proyecto y vuelve a la pantalla inicial.
  - Si hay cambios sin guardar, se solicita confirmación antes de cerrar.

- **Seguridad de rutas**
  - La lectura y la escritura verifican en Rust que el archivo esté dentro de la carpeta del
    proyecto.

No implementado en `M1.1.0` (fuera de alcance): crear, renombrar o eliminar archivos, crear
carpetas, drag and drop, menús contextuales avanzados, diseñador visual, preview integrado,
debugger, refactorización, pestañas múltiples, gestión avanzada de proyectos, Laravel, PHP,
Blade, Vue, Flutter, bases de datos, Git, terminal, plugins, autenticación, nube, colaboración e
IA.

#### M1.2.0 — Gestión de archivos del proyecto (completada)

Alcance implementado:

- **Crear archivos y carpetas**
  - Botones `+ Archivo` y `+ Carpeta` en el panel lateral, y las acciones `Nuevo archivo` y
    `Nueva carpeta` del menú contextual, que crean el elemento dentro de la carpeta señalada.
  - El árbol se actualiza solo tras la operación, sin reabrir el proyecto.
  - Un archivo nuevo compatible con el editor se abre directamente en el editor.

- **Renombrar**
  - Acción `Renombrar` del menú contextual y atajo `F2` sobre el elemento señalado.
  - Renombrar conserva el contenido: el archivo abierto sigue en el editor con sus cambios
    pendientes y pasa a la nueva ruta.

- **Eliminar**
  - Acción `Eliminar` del menú contextual y atajo `Supr` sobre el elemento señalado.
  - Si la carpeta o el archivo contiene archivos abiertos con cambios sin guardar, el diálogo de
    confirmación lo indica antes de eliminar nada.
  - Al eliminar, los búferes de esos archivos se cierran; si el archivo abierto era el eliminado,
    el editor queda vacío.

- **Búsqueda en el proyecto**
  - `Ctrl + Shift + F` o el campo de búsqueda del panel lateral buscan dentro del contenido de los
    archivos web del proyecto.
  - Los resultados muestran archivo, número de línea y el texto coincidente, y al elegir uno se
    abre el archivo con el cursor en esa línea.
  - `Ctrl + P` abre el buscador de archivos por nombre.
  - La búsqueda se realiza en Rust, con un máximo de 200 resultados.

- **Interacción con el árbol**
  - Selección con `clic`, apertura con `Enter`, expansión y contracción con `←` y `→`, y
    desplazamiento con `↑` y `↓`.
  - El elemento abierto se marca con `aria-current` y las carpetas con cambios sin guardar se
    señalan con `*`.

- **Cierre de proyecto sin perder trabajo**
  - `Cerrar proyecto` ofrece `Guardar y cerrar`, `Descartar cambios` y `Cancelar`.
  - Existe `Guardar todo` en la cabecera y con `Ctrl + Shift + S`, que escribe en el disco todos
    los archivos con cambios pendientes.

- **Robustez**
  - Las subcarpetas que el sistema no permite leer se omiten del árbol sin abortar el resto.
  - No se puede leer en el editor un archivo de más de 2 MB.
  - Los nombres inválidos o reservados en Windows se rechazan indicando el motivo.

No implementado en `M1.2.0` (fuera de alcance): recargar el árbol desde el disco, mover o copiar
archivos mediante arrastrar y soltar, recuperador de archivos eliminados, designer visual, preview
integrado, refactorización, git, terminal, plugins, autenticación, nube, colaboración e IA.

- La búsqueda construye el árbol desde la ruta original del proyecto, no desde la ruta
  canonicalizada, para que la ruta de un resultado sea la misma clave que usa el árbol en el
  frontend. Cubierto por una prueba.
- `useProject` queda dividido en dos hooks: `useProject` (crear, abrir, ejecutar y cerrar el
  proyecto) y `useWorkspace` (búferes, guardado, búsqueda y operaciones sobre archivos). Ambos
  devuelven el mensaje de error de la operación que han ejecutado para poder mostrarlo en el
  diálogo correspondiente.
- `FileTree` se reconstruye como lista de filas visibles: permite `Enter`, `F2`, `Supr` y las
  flechas del teclado, marca `aria-current` el archivo abierto, marca con `*` los archivos y las
  carpetas con cambios sin guardar, y ofrece el menú contextual. Cada fila es un componente
  `React.memo` con propiedades primitivas para no volver a renderizar el árbol entero.
- `CodeEditor` carga Monaco con `import()` diferido la primera vez que se abre un archivo, por lo
  que la pantalla inicial ya no descarga el paquete del editor.
- Nuevo `SearchOverlay` para `Ctrl + P` (abrir archivo por nombre) y `Ctrl + Shift + F` (buscar en
  el contenido), con desplazamiento con flechas y `Enter`. La búsqueda de contenido se pide a Rust
  con un retardo de 300 ms.
- Diálogos reutilizables en `src/components/ui`: `Modal`, `PromptDialog`, `ConfirmDialog` y
  `CloseProjectDialog` (guardar todo, descartar o cancelar).
- `ErrorBoundary` en `src/main.tsx` para que un fallo de React muestre una pantalla de error con
  la opción de recargar, en lugar de dejar la ventana en blanco.
- Añadidos `Guardar` y `Guardar todo` en la cabecera, con `Ctrl + S` y `Ctrl + Shift + S`, y aviso
  del navegador al cerrar la ventana con cambios pendientes.
- `src-tauri/tauri.conf.json`: título de ventana `Prisma`, tamaño `1100x700` (mínimo `720x480`) y
  política de seguridad de contenido (CSP) que solo permite los recursos de la propia aplicación.
  Verificado que la aplicación carga y se renderiza con esa CSP.

### M1.3.0 — Sistema completo de edición de código

- **Sistema de pestañas**: Soporte para múltiples archivos abiertos simultáneamente con
  barra de pestañas, indicadores de cambios sin guardar (`*`) y cierre con confirmación.
- **Detección de lenguaje**: `.html` → HTML, `.css` → CSS, `.js` → JavaScript, con detección
  automática para otros tipos compatibles con Monaco.
- **Monaco Editor**: Configuración mejorada con resaltado de sintaxis, números de línea, búsqueda,
  navegación y atajos de edición (Ctrl+Z, Ctrl+Y, Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+F).
- **Búsqueda inline (Ctrl+F)**: Búsqueda de texto dentro del archivo activo, con navegación
  siguiente/previa (F3/Shift+F3) y cierre (Escape).
- **Guardado**: Soporte para botón Guardar, Ctrl+S, guardado en disco y actualización inmediata
  del estado de cambios en todos los archivos abiertos.
- **Cambios sin guardar**: Indicador `*` en la pestaña cuando el contenido se ha modificado y
  aún no se ha guardado. Prevención de pérdida silenciosa al cerrar proyecto o pestañas.
- **Integración con el árbol**: Seleccionar archivo del árbol abre en pestaña existente o crea
  una nueva. Renombrado y eliminación de archivos actualizan correctamente el estado de las pestañas.
- **Barra de estado**: Muestra lenguaje actual, número de línea, columna y estado de guardado.
- **Confirmaciones**: Al cerrar una pestaña con cambios sin guardar, se muestra diálogo con opciones
  de Guardar, No guardar o Cancelar. Al cerrar proyecto con cambios sin guardar, se solicita confirmación.
- **Rendimiento**: Mantiene la ligereza de la aplicación sin dependencias innecesarias.
- **UI funcional**: Mejoras organizativas en la disposición de pestañas, jerarquía visual y
  separación visual entre árbol, pestañas y editor.

#### M1.4.0 — Ejecución externa y persistencia del entorno

Alcance implementado:

- **Ejecución del proyecto**
  - `Ejecutar` pide a Rust que localice la entrada del proyecto y la abra en el navegador
    predeterminado del sistema.
  - El `index.html` de la raíz del proyecto tiene prioridad. Si no existe, se busca el
    `index.html` más cercano dentro de subcarpetas, prefiriendo siempre el de menor profundidad
    (recorrido en anchura, máximo 8 niveles) y excluyendo carpetas ocultas.
  - Se informa del archivo que se ha abierto cuando la entrada no está en la raíz.
  - Si no hay ningún `index.html`, el botón queda desactivado y el motivo se explica en la interfaz
    en lugar de fallar en silencio.
  - Sigue sin haber navegador interno, preview, `iframe`, servidor local ni recarga automática: el
    resultado se ve en el navegador del sistema y Prisma no interviene en los cambios del
    proyecto.

- **Persistencia de la sesión**
  - La sesión se guarda en un archivo `session.json` dentro de la carpeta de configuración de la
    aplicación, con una estructura versionada.
  - Guarda únicamente lo mínimo: último proyecto abierto, pestañas (ruta, nombre y línea del
    cursor) y archivo activo. **Nunca guarda el contenido de los archivos**, que sigue siendo la
    única fuente de verdad y permanece en el disco.
  - La escritura es atómica: se escribe un archivo temporal y se renombra sobre el destino, de
    modo que un cierre inesperado nunca deja una sesión a medias.
  - Un archivo de sesión ausente, vacío, ilegible o con otro formato se ignora en lugar de impedir
    abrir Prisma.
  - Si el proyecto guardado ya no existe, la sesión se descarta y se vuelve a la pantalla inicial.

- **Recuperación del entorno**
  - Al arrancar, Prisma intenta reabrir el último proyecto automáticamente.
  - Las pestañas se recuperan solo si el archivo sigue existiendo en el proyecto y es compatible
    con el editor. Los que no se recuperan se indican por su nombre, sin impedir la recuperación
    del resto.
  - Si el archivo activo ya no existe, se activa el primer archivo recuperado en lugar de dejar el
    editor vacío.
  - Si el proyecto no tiene pestañas, la aplicación abre el workspace en blanco, sin quedarse
    bloqueada recuperándose.

- **Decisiones de comportamiento**
  - **Cerrar el proyecto explícitamente borra la sesión**: es una acción deliberada del usuario y
    el siguiente arranque debe abrir la pantalla inicial.
  - **Cerrar la ventana conserva la sesión**: en ese caso la sesión guardada es lo que permite
    recuperar el trabajo.
  - Abrir, cerrar o cambiar de pestaña se guarda de inmediato. La posición del cursor, que cambia
    en cada pulsación, se agrupa con un retardo de 500 ms para no escribir en disco continuamente.
  - Se espera a que termine la recuperación para no sobrescribir las pestañas anteriores con una
    lista vacía.

Corrección de `M1.3.0` incluida en esta versión:

- Se corrigió un error que impedía abrir el workspace cuando la ruta del proyecto venía vacía
  (`Cannot read properties of undefined (reading 'slice')`). La ruta se normaliza a `null`, el
  editor acepta `undefined` y `tsconfig.json` activa `noUncheckedIndexedAccess` para que el error
  no vuelva a aparecer por accesos fuera de rango.

### Módulo 2 — Diseñador visual

#### M2.0.0 — Base del diseñador visual

Alcance implementado:

- **Un modelo interno, no una pantalla**
  - Nuevo directorio `src/designer` con TypeScript puro: no importa React, no llama a Rust, no lee
    ni escribe archivos. Es la representación sobre la que se podrá dibujar en M2.1.0.
  - Los archivos del disco siguen siendo la única fuente de verdad. El modelo es una vista
    intermedia que se puede reconstruir y volver a escribir sin perder nada.

- **Identidad**
  - Cada nodo recibe un identificador propio de Prisma, `element-001`, `element-002`, etc.
  - Es independiente del `id` de HTML: un `id="loginButton"` del archivo no se confunde con el
    identificador interno, y un elemento sin `id` también lo tiene.
  - La identidad es estable: leer el mismo documento dos veces produce los mismos identificadores,
    lo que permitirá reconocer un elemento entre dos análisis distintos.

- **Jerarquía sin ciclos**
  - Un nodo guarda `parentId` y su lista de `children`. No hay referencias de objetos en ambos
    sentidos, así que el árbol se puede serializar y recorrer sin riesgo de bucles infinitos.
  - El orden de los hijos es su posición en `children`. No hay un campo `order` que pueda
    contradecirlo.
  - Ayudas para lo que pedirá el lienzo: orden, ascendientes, búsqueda por etiqueta, por `id` de
    HTML y por atributo.

- **Qué es un nodo**
  - `kind`: `element`, `text`, `comment`, `dynamic`, `directive` o `unknown`.
  - `known`: `false` en cuanto hay algo que Prisma no reconoce, sin dejar de conservar el elemento.
  - `origin`: archivo, línea y columna de origen.
  - `source` y `closingSource`: el texto exacto de la apertura y del cierre. Es la garantía de que
    el modelo no pierde nada: `serialize(leer(texto)) === texto` para los documentos que se pueden
    reconstruir, incluidos los mal formados.

- **Lector de HTML y Blade**
  - Lee etiquetas, atributos con y sin comillas, texto, comentarios, contenido dinámico
    (`{{ }}`, `{{{ }}}`), directivas Blade, bloques Blade con su cierre, componentes `<x-...>`,
    el doctype y los comentarios `{{-- --}}`.
  - `<script>` y `<style>` se conservan enteros y **no se interpretan**: un `<div>` dentro de un
    string de JavaScript no se convierte en un elemento de la página.
  - Lo que no se entiende se conserva: una etiqueta sin abrir, un cierre que sobra, un `<` de
    comparación o un `<?php ?>` se guardan tal cual, sin inventar nada alrededor.
  - Un HTML mal formado no descuadra el resto del documento: un elemento abierto sin cerrar se
    cierra solo, como haría un navegador.
  - El cierre de un bloque Blade se guarda en el bloque, igual que `</div>` se guarda en su
    elemento, en lugar de aparecer entre los hijos.

- **Modelo de estilos**
  - `Stylesheet`, `CssRule`, `CssDeclaration` y `StyleMatch`: las hojas, reglas, declaraciones y
    coincidencias se pueden consultar sin tocar el archivo.
  - Se conserva el texto original de cada regla y se distinguen las declaraciones `!important`.
  - Selectores de etiqueta, `#id`, `.clase`, `[atributo]`, `*`, pseudo-clases y los combinadores
    descendiente, hijo, adyacente y hermano. Se calcula la especificidad de cada uno.
  - Un selector con pseudo-clase se marca como `dynamic`: se reconoce y se guarda, pero un lienzo
    estático no lo aplica, porque `:hover` no se puede representar.
  - **No hay cascada**: se guardan las reglas que alcanzan a cada elemento y con qué
    especificidad, pero no se resuelve cuál gana ni se puede editar CSS todavía.

- **Clasificación de archivos**
  - Un archivo se clasifica por su extensión en `markup` (`.html`, `.htm`, `.php`,
    `.blade.php`), `style` (`.css`), `script` (`.js`, `.ts`, …) y `other`.
  - Un archivo de proyecto se reparte en cuatro grupos. **JavaScript queda fuera del modelo
    visual**: se clasifica aparte y no se mezcla con la estructura ni con la apariencia.

Decisiones de alcance:

- **No hay interfaz.** En M2.0.0 no existe lienzo, arrastrar y soltar, inspector, árbol visual,
  selección, edición desde el lienzo ni generación de código. La versión entrega el modelo y sus
  pruebas, que es lo que necesita la siguiente versión.
- **No se toca Rust.** `language_for` en `src-tauri/src/projects.rs` sigue sin reconocer `.php`, así
  que un archivo Blade se abre en Prisma como texto plano. Corresponde a M2.1.0.
- **No se resuelve la cascada CSS** ni se edita el estilo de un elemento.
- **No se añaden dependencias**: el modelo no incorpora ningún paquete. Las pruebas usan el runner
  de Node que ya usa el proyecto.

#### M2.1.0 — Analizador e importador de proyectos (completada)

Alcance implementado:

- **Escaneo del proyecto en Rust**
  - Nuevo comando `scan_project_files` en `src-tauri/src/projects.rs`: recorre una carpeta y
    devuelve cada archivo con su ruta absoluta, su ruta relativa con `/`, su nombre, su extensión y
    su tamaño, más los avisos del recorrido y si se alcanzó algún límite.
  - La lista de carpetas ignoradas llega desde el frontend (`DEFAULT_IGNORED_DIRS` en
    `src/analysis/scan.ts`): `node_modules`, `.git`, `target`, `dist`, `build` y `vendor`. Quien
    decide el criterio es el frontend, así que ampliar la lista no obliga a tocar Rust.
  - Límites del recorrido: 5000 archivos, 8 niveles de profundidad. Al llegar a un límite se
    devuelve un aviso en lugar de fallar.
  - El escaneo es de solo lectura: no escribe nada, no ejecuta `npm install`, `composer`, PHP ni
    JavaScript, y no abre el contenido de los archivos.
  - `language_for` reconoce `.php` y `.blade.php`, así que se abren con su resaltado: era la deuda
    que dejó `M2.0.0`.

- **Capa de análisis en `src/analysis`** (TypeScript puro, sin React y sin acceso a disco)
  - Recibe lo que otros ya leyeron: el escaneo, los contenidos y los fallos de lectura, y devuelve
    un `ProjectModel`. No hace `throw`: un archivo dañado termina en `readFailures` y el análisis
    sigue con el resto.
  - `scan.ts` pasa los archivos del escaneo a `FileModel` y los reparte en cuatro grupos:
    documentos, hojas de estilo, scripts y otros. La extensión es la del disco y el papel del
    archivo se decide por su nombre completo (un `.blade.php` es `blade`, no `php`).
  - `document.ts` construye el `DocumentModel` con el lector de M2.0.0: elementos, texto, título,
    `<link rel="stylesheet">`, `<script>` y avisos. Un doctype no es un aviso, y la sintaxis de
    plantilla (Blade o `{{ }}`) se anota una sola vez por documento.
  - `styles.ts` indexa las hojas enlazadas, las reglas por elemento y la vista inversa: qué
    reglas de qué hoja afectan a un elemento concreto.
  - `refs.ts` resuelve `href` y `src` contra la raíz del proyecto; lo externo (`http://`, `//`,
    `data:`) o lo que se sale de la raíz se marca como no resuelto sin intentar leerlo.
  - `warnings.ts` da un identificador único a cada aviso (`archivo#linea`) y limita los de un
    mismo documento a 40, resumiendo el resto en uno solo.
  - `analyze.ts` orquesta las cinco fases del análisis y calcula el resumen: archivos, documentos,
    hojas, scripts, elementos, reglas, avisos y referencias sin resolver.

- **Interfaz**
  - La barra lateral del workspace gana un conmutador `Archivos` / `Analisis`, sin ocupar espacio
    del editor.
  - `AnalysisPanel` muestra el resumen en cifras, los documentos, las hojas de estilo, los scripts
    detectados y los avisos, cada uno con su severidad y su `archivo:línea`.
  - Clic en un aviso con archivo: se abre ese archivo en esa línea. El botón `Reanalizar` vuelve a
    recorrer el proyecto, y si el análisis falla se ofrece reintentar.
  - `useAnalysis` arranca al abrir el proyecto, lee solo los documentos y las hojas de estilo, y
    se cancela si se cambia de proyecto para no analizar dos a la vez.

Decisiones de alcance:

- **Solo lectura.** El análisis no escribe ni modifica nada del proyecto importado.
- **No se ejecuta nada.** Ni PHP, ni JavaScript, ni `npm install`, ni `composer`, ni directivas
  Blade: lo que se lee se conserva tal cual.
- **No hay cascada completa.** Solo se aplican las hojas que el documento enlaza con
  `<link rel="stylesheet">`. No se sigue `@import`, no se resuelve cuál hoja gana y el contenido
  de un `<style>` se cuenta pero no se analiza.
- **Sin drag & drop, lienzo, edición visual, componentes, deshacer/rehacer, Laravel, base de
  datos ni rutas.** Sigue correspondiendo a versiones posteriores.
- **Sin dependencias nuevas.** Las pruebas siguen en el runner de Node que ya usa el proyecto.

#### Alcance previsto — a partir de `M2.2.0`

Lo que queda por hacer, y que este análisis ya permite:

- Dibujar el árbol del modelo en el lienzo, con selección y correspondencia con el archivo.
- Inspector de propiedades, con edición de atributos, textos y clases.
- Resolver la cascada CSS y leer los `<style>` incrustados.
- Decidir qué se hace con JavaScript en la vista: hoy se conserva el archivo y no se representa.

#### M2.2.0 — Diseñador visual: lienzo, árbol y sincronización HTML/CSS (completada)

Alcance implementado:

- **Núcleo de edición en `src/designer/edit.ts`** (TypeScript puro, sin React y sin IO):
  `insertElement`, `reparentNode`/`applyMove`, `reorderNode`, `ensureStylesheetLink` y
  `ensureStyleNode`. Toda edición devuelve `EditResult`: o se aplica entera o no se aplica.
- **Orquestador `src/hooks/useDesigner.ts`**: re-parse sin pérdidas al entrar en Diseño,
  detección del CSS objetivo (primer `<link>` externo o `<style>` interno), operaciones
  `insertTag`, `moveNode`, `reorder` y `ensureExternalCss`, y volcado a búferes con
  `applyToBuffers`.
- **Interfaz en `src/components/workspace/design/`**: `DesignCanvas` (render recursivo con
  selección y arrastre entre padres), `DesignTree` (árbol jerárquico con selección
  bidireccional y subir/bajar) y `DesignPanel` (paleta por `ELEMENT_PALETTE`, selector de
  padre y acciones).
- **Integración en `Workspace.tsx`**: conmutador `Código` / `Diseño` en la cabecera. En modo
  Diseño el lateral muestra el panel y el área principal el lienzo; el botón `Aplicar cambios`
  vuelca el lienzo a los búferes y guarda en disco. `selectFile` reutiliza el búfer existente
  para no sobrevivir cambios sin guardar, y `writeBuffer(path, content)` actualiza el búfer
  sin tocar las pestañas.
- **Fidelidad del roundtrip**: `serialize(parse(html))` conserva Blade, `<script>`, `<style>` y
  el texto exacto de apertura/cierre; las ediciones solo tocan los nodos afectados.

Decisiones de alcance (fuera de M2.2.0):

- **Sin eliminar nodos, sin redimensionar, sin deshacer/rehacer.** El inspector edita lo
  esencial (insertar, mover, reordenar); el resto sigue en el editor de código.
- **Sin cascada CSS completa.** Se lee y escribe el CSS objetivo, pero no se resuelve qué regla
  gana ni se sigue `@import`.
- **Sin pruebas de interfaz.** La UI se verifica manualmente; las pruebas automáticas cubren el
  núcleo puro (`edit`, `attributes`, `class`, `cssEdit`, `parse`, `tree`).
- **Sin dependencias nuevas.** Las pruebas siguen en el runner de Node que ya usa el proyecto.

#### M2.2.1 — Reconstrucción del diseñador visual (completada)

La interfaz de M2.2.0 mostraba el HTML como lista técnica y varias operaciones previstas no
funcionaban. Se reconstruyó la experiencia reutilizando todo el núcleo puro y se corrigieron
dos errores reales que la verificación destapó (`canContain` impedía subir un elemento a un
antecesor; `ensureStyleNode` reventaba en documentos sin `<head>`).

Alcance implementado:

- **Separación visual/técnico (`src/designer/visual.ts`)**: el lienzo dibuja los hijos del
  `<body>` (o el fragmento filtrado); `html`, `head`, `meta`, `title`, `link`, `script` y
  `style` se conservan en el modelo y el HTML pero no ocupan espacio visual. Los textos con
  solo espacios no se dibujan y el Blade dinámico aparece como insignia.
- **Lienzo centrado en el diseño**: página blanca sobre fondo punteado, zoom (botones, clic en
  el porcentaje para restablecer, `Ctrl+rueda`, centrar), desplazamiento nativo, estado
  `Canvas vacío`, texto real visible, imágenes con placeholder si no resuelven y selección con
  borde más etiqueta. La hoja del autor se inyecta con ámbito (`.ds-page`, sin `@media`) para
  previsualizar sus estilos sin pintar la UI de Prisma. Las coordenadas de soltado se corrigen
  por zoom y el fondo de la página suelta dentro del `<body>`, no fuera del documento.
- **Árbol jerárquico real**: colapsable, con `#id` como pista, selección bidireccional con el
  lienzo (el árbol sigue a la selección) y sin nodos técnicos.
- **Librería con buscador y Jerarquía colapsable**: la paleta por categorías
  (`Contenedores`, `Texto`, `Interacción`, `Media`, `Enlaces`, `Listas`) filtra por texto; el
  nuevo elemento entra en el contenedor seleccionado o en el fondo, recibe clase estable
  (`.div-1 { position: relative; }`), se selecciona y aparece en árbol, lienzo y HTML.
- **Inspector por secciones** (estilo Scene Builder): Propiedades, Texto, Identificación,
  Disposición (X/Y + tamaño), Estilos básicos (`display`, `position`, `margin`, `padding`,
  `color`, `background-color`, `font-size`) y Acciones (subir/bajar/eliminar).
- **Barra del documento**: la hoja es del HTML, no del componente. Muestra el documento activo
  con selector (enlazadas o `<style>` interno) y creación con nombre: crear enlaza el `<link>`
  y crea el fichero en el árbol. La hoja de estilos de la UI usa solo tokens del tema.
- **Núcleo añadido**: `deleteNode` y `setNodeText` en `edit.ts`, `writeDeclaration`,
  `stripAtRules` y `scopeCss` en `cssEdit.ts`, y categorías/etiquetas nuevas en la paleta.
  `useDesigner` expone `selectedNode`, `canvasNodes`, `containerId`, `updateText`,
  `setNodeAttr`, `setNodeStyle`, `nodeStyle`, `nodeBox` y `deleteNode`.
- **Sincronización**: `Canvas ↔ Árbol ↔ Modelo ↔ HTML ↔ CSS`. `Aplicar cambios` vuelca el
  lienzo a los búferes y guarda; sin hoja externa y con CSS generado, se materializa un único
  `<style>` interno. Abrir/importar no modifica archivos.

Decisiones de alcance (fuera de M2.2.1):

- **Sin deshacer/rehacer, sin redimensionar por handles, sin responsive/breakpoints.** El
  lienzo es desktop-first; los `@media` se conservan en el archivo pero no se previsualizan.
- **Sin cascada resuelta ni editor CSS completo.** Se lee/escribe la regla propia del
  elemento; `@import` no se sigue.
- **Sin pruebas de interfaz.** Cobertura automática del núcleo puro; la UI se verifica
  manualmente.

## Estado actual

Funciona actualmente:

- La aplicación arranca y muestra la pantalla de bienvenida de Prisma.
- **Crear proyecto web** funciona de extremo a extremo: permite escribir un nombre, elegir la
  carpeta de destino, genera físicamente la carpeta con los tres archivos, los enlaza
  correctamente y abre el proyecto creado en el workspace.
- **Abrir proyecto** funciona: permite elegir una carpeta existente y muestra su árbol de archivos.
- La pantalla de bienvenida es la única que se ve sin proyecto, y `Configuración` se abre desde
  ella y también desde la cabecera del workspace.
- El workspace muestra el árbol de archivos real del proyecto y permite seleccionar cada archivo.
- El editor Monaco muestra el contenido real del archivo seleccionado con resaltado de sintaxis
  para HTML, CSS y JavaScript.
- Las modificaciones se guardan en el archivo real del disco mediante el botón `Guardar` o
  `Ctrl + S`, y el estado de guardado se refleja en el árbol (`*`) y en la cabecera.
- `Ejecutar` localiza la entrada del proyecto y abre el `index.html` real en el navegador
  predeterminado del sistema, priorizando el de la raíz sobre los de subcarpetas.
- Los archivos y carpetas del proyecto se crean, renombran y eliminan físicamente, y el árbol se
  actualiza sin reabrir el proyecto.
- El workspace trabaja con varias pestañas: se pueden abrir archivos nuevos, cambiar entre ellos,
  cerrar cada uno y renombrar o eliminar sin perder el resto de las pestañas abiertas.
- La búsqueda por contenido (`Ctrl + Shift + F`) y la apertura rápida por nombre (`Ctrl + P`)
  recorren el proyecto real, y la búsqueda dentro del archivo activo (`Ctrl + F`) funciona en el
  propio editor.
- `Cerrar proyecto` permite guardar todo, descartar los cambios o cancelar antes de salir.
- La sesión se guarda sola en disco: al reabrir la aplicación, Prisma recupera el último proyecto
  con sus pestañas y devuelve el cursor a la línea aproximada donde estaba.
- Los errores de creación, apertura, lectura, guardado, búsqueda, ejecución y recuperación se
  muestran en la interfaz en lugar de fallar en silencio.
- Hay tres temas, `Claro`, `Oscuro` y `Neo`, aplicables a toda la aplicación y al propio editor de
  código. El tema se aplica al instante y se recuerda en la siguiente ejecución.
- El workspace muestra cuántos archivos están pendientes de guardar junto al nombre del proyecto.
- Si un archivo cambia en el disco mientras Prisma está abierto, no se sobrescribe: se avisa y el
  usuario decide.
- La barra lateral del workspace tiene dos modos, `Archivos` y `Analisis`. El análisis recorre el
  proyecto abierto, ignora `node_modules`, `.git`, `target`, `dist`, `build` y `vendor` y resume
  los documentos, las hojas de estilo, los scripts, los elementos, las reglas de CSS y los avisos
  encontrados.
- El análisis es de solo lectura: no escribe en el proyecto, no ejecuta PHP ni JavaScript, no
  instala dependencias y no modifica nada de lo que recorre. Un archivo ilegible o dañado no
  detiene el análisis del resto.
- Cada aviso de análisis indica su severidad y su `archivo:línea`; al pulsarlo se abre ese archivo
  en esa línea. El botón `Reanalizar` vuelve a recorrer el proyecto.
- El workspace tiene modo `Diseño`: el botón `Diseño` de la cabecera cambia el lateral al panel
  (paleta, selector de padre, árbol jerárquico) y el área principal al lienzo. En el lienzo se
  seleccionan elementos con clic y se arrastran entre padres; en el árbol se suben y bajan con
  los botones. El botón `Aplicar cambios` vuelca el lienzo a los búferes y guarda en disco.

Comprobaciones realizadas al cerrar `M2.2.1`:

- `npx tsc --noEmit` no informa de errores de tipos.
- `npm test` ejecuta 300 pruebas del frontend con el runner integrado de Node, todas correctas.
  Las 23 nuevas cubren `src/designer/visual.ts` (9: filtrado técnico, hijos del body, fragmentos,
  textos vacíos, insignias Blade, lienzo vacío y etiquetas), `writeDeclaration`/`scopeCss`/
  `stripAtRules` (8) y `deleteNode`/`setNodeText`/anti-ciclos (6).
- Además se ejecutó una verificación funcional temporal de 12 comprobaciones (§32, pruebas 1–15
  a nivel modelo/HTML/CSS: lienzo vacío, crear, padre/hijo, mover, re-parenting dentro y fuera,
  jerarquía compuesta, clases estables, CSS externo/interno, importado fiel, Blade/JS intactos
  y roundtrip), toda correcta. El script se borró tras ejecutarse.
- `npm run build` (Vite) compila sin errores.

Comprobaciones realizadas al cerrar `M2.2.0`:

- `npx tsc --noEmit` no informa de errores de tipos.
- `npm test` ejecuta 277 pruebas del frontend con el runner integrado de Node, todas correctas.
  Las 9 nuevas cubren `src/designer/edit.ts` (insertar, mover entre padres, reordenar y rechazo
  de mover un elemento a sí mismo) y `src/designer/attributes.ts` (añadir clase, sobrescribir y
  añadir atributos, y no tocar etiquetas de contenido plano).
- `npm run build` (Vite) compila sin errores.

Comprobaciones realizadas al cerrar `M2.1.0`:

- `npx tsc --noEmit` no informa de errores de tipos.
- `npm test` ejecuta 241 pruebas del frontend con el runner integrado de Node, todas correctas. Las
  58 nuevas cubren `src/analysis`: archivos y grupos del escaneo (9), referencias relativas (10),
  documentos y avisos (12), índice de estilos (12) y análisis completo (15). Las 183 de `M2.0.0` y
  las anteriores siguen pasando.
- `cargo test` en `src-tauri` da 39 pruebas, todas correctas: 6 nuevas sobre el escaneo, entre ellas
  una que recorre el proyecto de ejemplo de `fixtures/demo-project`.
- `cargo clippy --all-targets` no informa de avisos.
- `npm run build` (Vite) compila sin errores.

Limitaciones conocidas de `M2.1.0`:

- **El análisis es un resumen, no una cascada.** Solo se aplican las hojas que un documento enlaza
  con `<link rel="stylesheet">`: no se sigue `@import`, no se resuelve cuál hoja gana y el contenido
  de un `<style>` se cuenta pero no se analiza.
- Las hojas enlazadas que no son locales (`https://`, `//`, `data:`) se marcan como no resueltas y
  no se descargan, ni siquiera si el usuario lo pidiera: Prisma no sale de la carpeta del proyecto.
- Los scripts no se leen. Se sabe que existen y si su `src` apunta a un archivo del proyecto, pero
  su contenido no entra en el análisis.
- El escaneo no es incremental: `Reanalizar` vuelve a recorrerlo todo. Tampoco se avisa si el
  proyecto cambia mientras está abierto, más allá del aviso de cambios externos que ya existía en el
  editor.
- La lista de carpetas ignoradas es una constante de código (`DEFAULT_IGNORED_DIRS`). Ampliarla
  hoy obliga a editar `src/analysis/scan.ts`; no hay un campo en `Configuración`.
- El análisis no se ha comprobado con la aplicación real: las 58 pruebas usan el runner de Node y
  el panel de análisis no tiene pruebas de interfaz.

Limitaciones conocidas de `M2.2.1`:

- El diseñador no deshace/rehace, no redimensiona por handles y no edita `@media`: esas
  operaciones siguen haciéndose en el editor de código. Eliminar, texto, `id`, `class`,
  posición, tamaño y estilos básicos sí están en el panel de propiedades.
- El CSS externo se guarda en disco al pulsar `Aplicar cambios`, sin pasar por el estado
  `Sin guardar` del búfer; el HTML sí pasa por el búfer y respeta `Guardar` / `Ctrl + S`.
- El lienzo y el árbol no tienen pruebas automatizadas de interfaz; la cobertura automática es
  del núcleo puro (`src/designer`). La UI se verifica manualmente.
- Los estilos del `body` del autor no se aplican a la página del lienzo (solo las reglas de
  clases, ids y etiquetas, con ámbito); los estilos en línea sí se previsualizan.

Limitaciones conocidas de `M2.2.0`:

- El diseñador no elimina nodos, no redimensiona, no deshace/rehace y no edita texto ni
  atributos desde un inspector: esas operaciones siguen haciéndose en el editor de código.
- El CSS externo se guarda en disco al pulsar `Aplicar cambios`, sin pasar por el estado
  `Sin guardar` del búfer; el HTML sí pasa por el búfer y respeta `Guardar` / `Ctrl + S`.
- El lienzo y el árbol no tienen pruebas automatizadas de interfaz; la cobertura automática es
  del núcleo puro (`src/designer`).

Comprobaciones realizadas al cerrar `M2.0.0`:

- `npx tsc --noEmit` no informa de errores de tipos.
- `npm test` ejecuta 183 pruebas del frontend con el runner integrado de Node, todas correctas. Las
  123 de `src/designer` cubren el árbol y la identidad (51), el lector de HTML y Blade (48), el
  modelo de estilos, los selectores y las coincidencias elemento/CSS (18) y la clasificación de
  archivos (6). Las 60 anteriores de M1.5.0 siguen pasando.
- `cargo test` en `src-tauri` da 33 pruebas, todas correctas: M2.0.0 no toca Rust.
- `cargo clippy --all-targets` no informa de avisos.
- `npm run build` (Vite) compila sin errores.

Limitaciones conocidas de `M2.0.0`:

- **El diseñador todavía no se ve.** Esta versión es el modelo y sus pruebas. No hay lienzo,
  inspector, arrastrar y soltar, edición visual ni generación de código: nada de esto se ha
  construido todavía.
- El lector de HTML y Blade es mínimo a propósito. Cubre lo común y conserva lo que no entiende,
  pero no implementa la especificación HTML: no hay `table`, no hay reglas de corrección de errores
  del navegador, y el contenido de un `<template>` no se interpreta.
- Un archivo `.php` o `.blade.php` sigue sin reconocerse en Rust, así que se abre como texto plano
  en lugar de con su resaltado. El modelo sí los reconoce y los clasifica como marcado.
- La cascada CSS no se resuelve. Se guardan las reglas que alcanzan a cada elemento y su
  especificidad, pero no cuál gana, y no se puede editar el estilo de un elemento.
- Los `<style>` incrustados en el HTML se conservan como texto y no se analizan. Solo se leen las
  hojas `.css` como archivo.
- El plan de un proyecto se calcula a partir de una lista de rutas. Todavía no se recorre un
  proyecto real para decidir cuál es la entrada visual.
- El modelo no se ha conectado al proyecto abierto: todavía no lee los archivos de un proyecto de
  verdad, solo texto que se le pase.

Comprobaciones realizadas al cerrar `M1.5.0`:

- `npx tsc --noEmit` no informa de errores de tipos.
- `npm test` ejecuta 60 pruebas del frontend con el runner integrado de Node, todas correctas: 33
  de `src/workspace/state.test.ts` (pestañas, sesión y cambios externos) y 27 de
  `src/theme/theme.test.ts` (temas, aplicación del atributo y tema de Monaco). Esta última incluye
  una comprobación que lee `themes.css` y `editorTheme.css` y falla si a un tema le falta un token
  o si algún estilo de componente escribe un color en lugar de usar un token.
- `cargo test` en `src-tauri` da 33 pruebas, todas correctas: 15 de proyectos y archivos, 5 de
  `jsonfile`, 6 de preferencias y 7 de sesión.
- `cargo clippy --all-targets` no informa de avisos.
- `npm run build` (Vite) compila sin errores.

Comprobaciones realizadas al cerrar `M1.4.0`:

- `npx tsc --noEmit` no informa de errores de tipos.
- `npm test` ejecuta 29 pruebas del frontend con el runner integrado de Node, todas
  correctas. Cubren el renombrado de archivos y carpetas, la eliminación con recálculo de la
  pestaña activa, el cierre de pestañas, la construcción de la sesión y la recuperación
  descartando lo que ya no existe o no es editable. Esa lógica vive en
  `src/workspace/state.ts`, sin React, y `useWorkspace` la reutiliza en lugar de duplicarla.
- `cargo test` en `src-tauri` da 22 pruebas, todas correctas. Además de las 15 de proyectos y
  archivos, cubren la escritura, reescritura, lectura, tolerancia a archivos ausentes o dañados,
  compatibilidad con sesiones antiguas y borrado de la sesión.
- `cargo clippy --all-targets` no informa de avisos.
- `npm run build` (Vite) compila sin errores. El paquete inicial de la interfaz baja de unos
  4,2 MB a unos 251 kB: Monaco queda en fragmentos que se descargan al abrir el primer archivo.

Limitaciones conocidas:

- El flujo visual (diálogos, menú contextual, árbol, búsqueda, pestañas, ejecución y recuperación)
  **no se ha verificado de forma automatizada**: no existen pruebas de interfaz. La comprobación de
  la parte visual requiere una revisión manual.
- El aspecto de los tres temas, y en concreto que el editor siga al tema sin recrearse, está
  cubierto con pruebas sobre los tokens y la construcción del tema de Monaco, pero **no se ha
  revisado todavía en la ventana real**. Es la comprobación manual pendiente más importante de
  esta versión.
- La persistencia de las preferencias tiene pruebas del comando de Rust, pero no se ha
  comprobado el ciclo completo en la aplicación real: cambiar de tema, cerrar Prisma y volver a
  arrancarlo.
- `Neo` es un tema oscuro de alto contraste definido con tokens propios. No es un tema que se
  pueda volver a generar desde la paleta de otro, ni tiene variantes.
- El aviso de cambios externos compara el contenido byte a byte, así que un archivo retocado solo
  en espacios en blanco o en el salto de línea final también se considera cambiado. No se mezclan
  las dos versiones ni hay una pantalla de conflicto: Prisma no sobrescribe y avisa.
- El árbol no se actualiza solo si los cambios se hacen desde otro programa mientras Prisma está
  abierto. Ahora el guardado detecta el cambio y avisa, pero para verlos hay que reabrir el archivo
  o el proyecto.
- La persistencia de la sesión está cubierta con pruebas unitarias del comando de Rust, pero no
  se ha comprobado todavía el ciclo completo de la aplicación real: abrir Prisma, dejar pestañas,
  cerrar la ventana y volver a arrancarla.
- La sesión se escribe con un retardo de 500 ms para la posición del cursor. Abrir, cerrar o
  cambiar de pestaña se guarda de inmediato, así que no se pierden pestañas por cerrar la ventana
  justo después de abrirlas.
- El árbol omite las entradas que empiezan por `.` y no supera 8 niveles de profundidad.
- La búsqueda recorre los archivos reconocidos por el editor, con un máximo de 200 resultados, y no
  busca dentro de archivos de más de 2 MB.
- Si el proyecto guardado ya no existe, la sesión se descarta y hay que elegir el proyecto de
  nuevo: no hay recuperación ni aviso de que el proyecto se había movido.
- Monaco Editor sigue siendo el mayor coste de la aplicación: su fragmento pesa unos 2,7 MB
  (706 kB comprimido), aunque ya no se descarga hasta que se abre un archivo.

## Próximos objetivos

- Recargar el árbol de archivos desde el disco.
- Divisor redimensionable entre árbol y editor.
- Ampliar el soporte a otros tipos de proyecto y tecnologías.

Estos objetivos son únicamente los conocidos. No se ha definido ni implementado nada más.

## Reglas de desarrollo

- Mantener el proyecto ligero.
- Evitar dependencias innecesarias: no añadir paquetes que no cubran una necesidad concreta de la
  versión en curso.
- No cambiar las tecnologías principales (Tauri, Rust, React, TypeScript, Vite) sin una decisión
  explícita.
- No implementar funcionalidades fuera del objetivo de la versión actual.
- Mantener la separación entre interfaz y lógica: React para la vista, Rust para el sistema de
  archivos.
- No acceder al sistema de archivos desde React. Toda operación pasa por un comando de Rust
  registrado en `src-tauri/src/lib.rs` y chamado desde `src/services/projects.ts`.
- Evitar abstracciones innecesarias y mantener el código sencillo.
- Actualizar este README cuando cambie el estado importante del proyecto.
- No declarar una funcionalidad como terminada si no funciona.

## Registro de cambios

### Módulo 0 — Base técnica

- Creación del proyecto Tauri + React + TypeScript + Vite con la ventana de escritorio
  funcionando.
- Pantalla inicial de Prisma con nombre, descripción y las acciones "Crear proyecto web" y
  "Abrir proyecto" (visuales).
- Estructuración de estilos en `src/styles` y `src/components`, con variables CSS y componentes
  de botón compartidos.

### Módulo 1 — Proyectos web

#### M1.0.0 — Creación y apertura básica de proyectos web

- Añadido `tauri-plugin-dialog` (Rust y JavaScript) para la selección nativa de carpetas.
  Permiso `dialog:default` añadido a `src-tauri/capabilities/default.json`.
- Nuevo módulo `src-tauri/src/projects.rs` con los comandos `create_web_project` y
  `open_project`, la validación del nombre del proyecto, la generación de las plantillas de
  `index.html`, `style.css` y `script.js`, y el análisis de archivos web de una carpeta.
- Registrados los dos comandos en `src-tauri/src/lib.rs` y eliminado el comando de ejemplo
  `greet`, que ya no se utilizaba.
- Nuevo tipo `ProjectInfo` en `src/types/project.ts`.
- Nuevo servicio `src/services/projects.ts` como único punto de contacto con los comandos de Rust.
- Nuevo hook `useProject` con el estado del proyecto abierto, los errores y las operaciones de
  creación y apertura.
- Nuevo componente `CreateProjectDialog` con el nombre del proyecto, el selector de carpeta y la
  validación de la información mínima necesaria.
- Nuevo componente `ProjectScreen` que muestra el proyecto abierto y los archivos HTML, CSS y
  JavaScript reconocidos.
- `StartScreen` conectado a las acciones reales de creación y apertura, con gestión de errores.
- Botones compartidos (`.button`, `.button--primary`, `.button--secondary`) definidos en
  `src/styles/global.css` y reutilizados por todas las pantallas.
- Pruebas unitarias de los comandos de Rust en `src-tauri/src/projects.rs`.
- Reescritura de este README como documento de contexto permanente del proyecto.

#### M1.1.0 — Workspace básico de edición de proyectos web

- Añadida la dependencia `monaco-editor` como editor de código. Se usa directamente, sin
  envoltorio de React, mediante un componente propio (`CodeEditor.tsx`).
- Nuevo archivo `src/editor/monacoEnvironment.ts` con los workers de Monaco (editor, CSS, HTML,
  JSON y TypeScript) empaquetados por Vite, para que el editor funcione sin conexión. La
  configuración de Vite (`vite.config.ts`) se dejó sin cambios: los imports `?worker` se
  resolven correctamente solo dentro del grafo de la aplicación, no desde el archivo de
  configuración.
- `ProjectInfo` pasa a devolver un árbol (`tree`) de archivos y carpetas en lugar de listas planas
  por tipo. Cada nodo incluye su ruta, su tipo y el lenguaje reconocido, que es lo que permite
  tanto el árbol del workspace como el resaltado del editor.
- Nuevos comandos en Rust: `read_project_file`, `save_project_file` y `open_in_browser`. Los dos
  primeros verifican que la ruta esté dentro de la carpeta del proyecto antes de leer o escribir.
  El último usa `tauri-plugin-opener` para abrir el archivo en el programa predeterminado del
  sistema.
- El árbol recorre subcarpetas hasta 8 niveles, ordena carpetas antes que archivos y omite las
  entradas que empiezan por `.`.
- Nuevo `Workspace` (`src/components/workspace/Workspace.tsx`) con cabecera, panel lateral, editor y
  barra de estado. Sustituye a la anterior `ProjectScreen`, que se ha eliminado.
- Nuevo componente `FileTree` con selección de archivo, marca del archivo activo, marca `*` de
  cambios sin guardar y etiqueta de lenguaje.
- Nuevo componente `CodeEditor` que instancia Monaco, crea un modelo por archivo y mantiene el
  contenido de cada archivo en un búfer en memoria, de modo que cambiar de archivo no pierde las
  ediciones pendientes.
- `useProject` ampliado con el estado del workspace: búferes por archivo, archivo activo, conjunto
  de archivos modificados, guardado, ejecución y cierre con aviso de cambios sin guardar.
- Atajo `Ctrl + S` (y `Cmd + S`) para guardar, además del botón `Guardar`.
- Botón `Ejecutar` que localiza el `index.html` del proyecto y lo abre en el navegador del sistema.
- `App.tsx` muestra el workspace cuando hay un proyecto abierto y la pantalla inicial cuando no lo
  hay. El flujo de M1.0.0 se mantiene intacto.

#### M1.2.0 — Gestión de archivos del proyecto

- Nuevos comandos en Rust: `create_file`, `create_folder`, `rename_entry`, `delete_entry` y
  `search_project_files`. Todos devuelven el árbol del proyecto ya actualizado, de modo que la
  interfaz no necesita dos viajes para cada operación.
- Validación común de nombres en Rust: vacío, `.` o `..`, caracteres no permitidos, terminación en
  punto o espacio, nombres reservados de Windows y existencia previa del elemento.
- Todas las operaciones comprueban que la ruta esté dentro de la carpeta del proyecto antes de
  tocar el disco, incluidos los intentos de renombrar la raíz o de eliminarla.
- El árbol omite las subcarpetas que no se pueden leer en lugar de fallar, y la lectura del editor
  rechaza archivos de más de 2 MB. La búsqueda se limita a 200 resultados.
- La búsqueda construye el árbol desde la ruta original del proyecto, no desde la ruta
  canonicalizada, para que la ruta de un resultado sea la misma clave que usa el árbol en el
  frontend. Cubierto por una prueba.
- `useProject` queda dividido en dos hooks: `useProject` (crear, abrir, ejecutar y cerrar el
  proyecto) y `useWorkspace` (búferes, guardado, búsqueda y operaciones sobre archivos). Ambos
  devuelven el mensaje de error de la operación que han ejecutado para poder mostrarlo en el
  diálogo correspondiente.
- `FileTree` se reconstruye como lista de filas visibles: permite `Enter`, `F2`, `Supr` y las
  flechas del teclado, marca `aria-current` el archivo abierto, marca con `*` los archivos y las
  carpetas con cambios sin guardar, y ofrece el menú contextual. Cada fila es un componente
  `React.memo` con propiedades primitivas para no volver a renderizar el árbol entero.
- `CodeEditor` carga Monaco con `import()` diferido la primera vez que se abre un archivo, por lo
  que la pantalla inicial ya no descarga el paquete del editor.
- Nuevo `SearchOverlay` para `Ctrl + P` (abrir archivo por nombre) y `Ctrl + Shift + F` (buscar en
  el contenido), con desplazamiento con flechas y `Enter`. La búsqueda de contenido se pide a Rust
  con un retardo de 300 ms.
- Diálogos reutilizables en `src/components/ui`: `Modal`, `PromptDialog`, `ConfirmDialog` y
  `CloseProjectDialog` (guardar todo, descartar o cancelar).
- `ErrorBoundary` en `src/main.tsx` para que un fallo de React muestre una pantalla de error con
  la opción de recargar, en lugar de dejar la ventana en blanco.
- Añadidos `Guardar` y `Guardar todo` en la cabecera, con `Ctrl + S` y `Ctrl + Shift + S`, y aviso
  del navegador al cerrar la ventana con cambios pendientes.
- `src-tauri/tauri.conf.json`: título de ventana `Prisma`, tamaño `1100x700` (mínimo `720x480`) y
  política de seguridad de contenido (CSP) que solo permite los recursos de la propia aplicación.
  Verificado que la aplicación carga y se renderiza con esa CSP.

#### M1.4.0 — Ejecución externa y persistencia del entorno

- Nuevo módulo `src-tauri/src/session.rs` con los comandos `load_session`, `save_session` y
  `clear_session`. La sesión se escribe como json en la carpeta de configuración de la aplicación.
  La escritura es atómica (archivo temporal y renombrado) y una sesión ausente, vacía, ilegible o
  con otro formato se ignora sin impedir el arranque.
- Nuevo comando `run_project` en Rust, que sustituye a `open_in_browser`. Valida el proyecto,
  localiza la entrada (`index.html` de la raíz con prioridad y, si no existe, el más cercano dentro
  de subcarpetas, por anchura y hasta 8 niveles, ignorando carpetas ocultas) y devuelve qué archivo
  se ha abierto para poder informarlo en la interfaz.
- Nuevo tipo `RunTarget` en `src/types/session.ts` con la ruta de la entrada y su procedencia.
  `useProject` lo usa para activar o desactivar `Ejecutar` antes de que el usuario pulse.
- Nuevo servicio `src/services/session.ts` y tipos `SessionState` y `SessionTab`.
- Nuevo módulo `src/workspace/state.ts` con la lógica pura de pestañas y sesión: renombrado,
  eliminación, cierre de pestañas, construcción de la sesión y filtrado de lo recuperable.
  `useWorkspace` la reutiliza en lugar de mantener su propia copia.
- Nuevo `src/workspace/state.test.ts` con 29 pruebas ejecutadas por el runner integrado de Node
  (`npm test`), sin añadir dependencias al proyecto.
- `src/types/node-test.d.ts` declara lo mínimo de `node:test` y `node:assert` que usan las pruebas,
  para no introducir `@types/node` solo por eso.
- `useProject` recupera el último proyecto al arrancar y borra la sesión si ese proyecto ya no
  existe. `closeProject` borra la sesión porque cerrar el proyecto es una decisión explícita.
- `useWorkspace` guarda la sesión con un retardo de 500 ms y espera a que termine la recuperación
  antes de guardar, para no sobrescribir las pestañas anteriores con una lista vacía.
- `CodeEditor` notifica la posición del cursor para poder guardarla en la sesión.
- `StartScreen` muestra `Recuperando el último proyecto...` mientras se restaura el entorno.
- Corrección del error `Cannot read properties of undefined (reading 'slice')`: la ruta del
  proyecto se normaliza a `null`, el editor acepta `undefined` y `tsconfig.json` activa
  `noUncheckedIndexedAccess`.
- Regenerados los iconos de la aplicación desde `prisma.ico`, ya con la marca de Prisma, y
  eliminado el logo de la plantilla de Tauri de la interfaz.

#### M1.5.0 — Consolidación, experiencia inicial y personalización

- Nuevo módulo `src-tauri/src/preferences.rs` con los comandos `load_preferences` y
  `save_preferences`. Guarda las preferencias en `preferences.json`, dentro de la carpeta de
  configuración de la aplicación, nunca dentro de un proyecto. La escritura es atómica y un
  archivo ausente, ilegible o con un tema desconocido se descarta sin impedir el arranque.
- Nuevo módulo `src-tauri/src/jsonfile.rs` con la lectura, escritura atómica y borrado de archivos
  json. `session.rs` y `preferences.rs` lo reutilizan en lugar de mantener dos copias de la
  escritura a disco.
- Nuevo `src/types/preferences.ts` con `ThemeName`, la lista `THEMES` y `resolveTheme`, que
  garantiza que solo se apliquen los tres temas conocidos. El tema predeterminado es el claro.
- Nuevo `src/theme/applyTheme.ts`: el tema activo se marca con `data-theme` en el elemento raíz.
  Las funciones reciben el elemento sobre el que trabajan, así que se pueden probar sin montar una
  ventana.
- Nuevo `src/styles/themes.css` con los tokens de los tres temas: claro, oscuro y neo. Ningún
  componente escribe ya un color propio; todos usan `var(--...)`.
- Nuevo `src/styles/editorTheme.css` con los tokens del editor. Monaco no lee variables css, así que
  `src/editor/editorTheme.ts` construye su tema con esos tokens y lo vuelve a registrar al cambiar
  de tema, sin recrear el editor: no se pierde el cursor, el desplazamiento ni lo que no se ha
  guardado.
- `color-scheme` en cada tema para que las barras de desplazamiento y los campos de formulario
  sigan al tema sin estilarlos uno a uno.
- `StartScreen` pasa a llamarse `WelcomeScreen` y añade un acceso a `Configuración`.
- Nueva pantalla `SettingsScreen`, alcanzable desde la bienvenida y desde la cabecera del
  workspace, con la sección de apariencia y un tema por opción con su muestra de color. Si una
  preferencia no se puede leer o guardar, se avisa en la propia pantalla en vez de fallar en
  silencio.
- `App` decide entre bienvenida, ajustes y workspace, y muestra los ajustes como una capa sobre el
  proyecto cuando hay uno abierto.
- `usePreferences` carga el tema al arrancar, lo aplica antes de que haya proyecto para que la
  bienvenida ya salga con el tema elegido, y lo guarda en cuanto el usuario lo cambia.
- El workspace muestra un contador de archivos pendientes de guardar junto al nombre del proyecto.
- `requestCloseProject` vuelve a usar `hasUnsavedChanges` del hook, que ya lleva la cuenta, en lugar
  de recorrer otra vez los búferes.
- Nuevo `externalChangeMessage` en `src/workspace/state.ts`. Antes de escribir, `useWorkspace`
  compara el archivo con lo que había en el disco cuando se abrió: si ha cambiado por fuera, no se
  sobrescribe y se avisa, porque perder el trabajo de otra persona no es un precio aceptable por
  guardar una pulsación antes.
- Nuevo `src/theme/theme.test.ts` con 27 pruebas: los tres temas y sus nombres, el valor
  predeterminado, el rechazo de cualquier otro valor, la aplicación y lectura del atributo, la
  construcción del tema de Monaco y la cobertura de tokens. Incluye una comprobación que lee
  `themes.css` y `editorTheme.css` y falla si a un tema le falta un token o si algún estilo de
  componente vuelve a escribir un color suelto.
- `src/workspace/state.test.ts` ampliado con 4 pruebas de `externalChangeMessage`.
- `src/types/node-test.d.ts` ampliado con `notEqual`, `match` y `node:fs`, que usan las pruebas
  nuevas, manteniendo la promesa de no añadir `@types/node`.

### Módulo 2 — Diseñador visual

#### M2.0.0 — Base del diseñador visual

- Nuevo directorio `src/designer` con el modelo visual interno. TypeScript puro, sin React, sin
  Rust y sin acceso al sistema de archivos.
- `types.ts` con `PrismaNode`, `DesignDocument` y los contratos del modelo. Cada nodo guarda su
  `kind`, si Prisma lo reconoce o no (`known`), su origen y el texto exacto de apertura y cierre
  (`source` y `closingSource`).
- `identity.ts` con identificadores propios de Prisma (`element-001`), independientes del `id` de
  HTML y estables entre lecturas.
- `tree.ts` con la construcción del árbol, el orden, los ascendientes, las consultas por etiqueta,
  por `id` de HTML y por atributo, y la serialización. La jerarquía usa `parentId` más `children`,
  sin ciclos, y el orden es la posición en `children`.
- `html.ts` con el catálogo de etiquetas conocidas, las void, las de texto plano y de contenido no
  visual, y la detección de componentes Blade.
- `parse.ts` con un lector mínimo de HTML y Blade: etiquetas, atributos, texto, comentarios,
  contenido dinámico, directivas, bloques con su cierre, componentes, doctype y raw. Lo que no
  reconoce se conserva sin inventar nada, y un documento mal formado no descuadra el árbol.
- `styles.ts`, `selector.ts` y `css.ts` con el modelo de hojas, reglas, declaraciones,
  especificidad, selectores y las coincidencias elemento/CSS. Se marcan como `dynamic` los
  selectores con pseudo-clase, porque un lienzo estático no puede representarlos. No se resuelve la
  cascada.
- `classify.ts` con la clasificación de archivos por extensión y el reparto de un proyecto en
  marcado, estilo, script y otros. JavaScript se clasifica aparte y queda fuera del modelo visual.
- 123 pruebas nuevas en cuatro archivos: `tree.test.ts` (51), `parse.test.ts` (48),
  `styles.test.ts` (18) y `classify.test.ts` (6). Entre ellas hay una comprobación de fidelidad por
  documento: el texto reconstruido tiene que ser idéntico al original, incluidos los casos mal
  formados, sin cerrar y con etiquetas desconocidas.
- `src/types/node-test.d.ts` ampliado con `ok` y `node:assert/strict`, que usan las pruebas nuevas.
- Sin dependencias nuevas, sin cambios en Rust y sin cambios en la interfaz.

#### M2.1.0 — Analizador e importador de proyectos

- `src-tauri/src/projects.rs` con el comando `scan_project_files`, los tipos `ScannedFile` y
  `ProjectScan`, la lista de carpetas ignoradas recibida del frontend, los límites de 5000 archivos
  y 8 niveles, y `language_for` reconociendo `.php` y `.blade.php`.
- `src-tauri/src/lib.rs` con el comando registrado.
- `src/types/project.ts` con `ScannedFile` y `ProjectScan`, y `src/services/projects.ts` con
  `scanProjectFiles`.
- Nuevo directorio `src/analysis`, TypeScript puro, sin React y sin acceso al sistema de archivos:
  `types.ts` (`FileModel`, `DocumentModel`, `AnalysisWarning`, `ProjectModel` y contratos),
  `scan.ts` (archivos del escaneo a modelo y grupos), `refs.ts` (referencias relativas dentro del
  proyecto), `warnings.ts` (identificadores y tope por documento), `document.ts` (documentos y sus
  avisos), `styles.ts` (índice de hojas enlazadas, reglas por elemento y asociaciones) y
  `analyze.ts` (las cinco fases del análisis y el resumen).
- Nuevo `src/hooks/useAnalysis.ts`: escanea y analiza el proyecto abierto, cancela el análisis
  anterior si cambia el proyecto y lo repite con `reanalyze`.
- Nuevos `src/components/workspace/AnalysisPanel.tsx` y `AnalysisPanel.css`: resumen, documentos,
  hojas de estilo, scripts detectados y avisos con severidad, saltando a la línea al pulsarlos.
- `src/components/workspace/Workspace.tsx` y `Workspace.css` con el conmutador `Archivos` /
  `Analisis` en la cabecera de la barra lateral.
- `src/designer/css.ts` corregido: `splitRules` atribuía a cada regla la línea del `}` anterior
  cuando dos reglas venían seguidas.
- `src/theme/theme.test.ts` con `AnalysisPanel.css` en la lista de estilos que deben usar tokens.
- `fixtures/demo-project` con un proyecto de ejemplo: HTML, dos plantillas Blade con componente,
  dos hojas de estilo, scripts y referencias externas y rotas.
- 58 pruebas nuevas en `src/analysis` y 6 en Rust. Sin dependencias nuevas.

#### M2.2.0 — Diseñador visual: lienzo, árbol y sincronización HTML/CSS

- `src/designer/edit.ts` con `insertElement`, `reparentNode`/`applyMove`, `reorderNode`,
  `ensureStylesheetLink` y `ensureStyleNode`, todo con `EditResult` atómico.
- `src/hooks/useDesigner.ts` con carga del documento activo, detección del CSS objetivo,
  operaciones de edición y `applyToBuffers`.
- `src/components/workspace/design/` con `DesignCanvas`, `DesignTree`, `DesignPanel`,
  `design.css` e `index.ts`.
- `src/components/workspace/Workspace.tsx` con el conmutador `Código` / `Diseño` y el botón
  `Aplicar cambios`.
- `src/hooks/useWorkspace.ts` con `writeBuffer(path, content)` y `selectFile` reutilizando el
  búfer existente.
- 9 pruebas nuevas: `src/designer/edit.test.ts` (5) y `src/designer/attributes.test.ts` (4).
  Sin dependencias nuevas.

#### M2.2.1 — Reconstrucción del diseñador visual

- `src/designer/visual.ts` nuevo: separación visual/técnico, hijos del body, insignias Blade.
- `src/designer/cssEdit.ts` con `writeDeclaration`, `stripAtRules` y `scopeCss`.
- `src/designer/edit.ts` con `deleteNode` y `setNodeText`; `canContain` corregido (permitir
  subir a un antecesor) y `ensureStyleNode`/`ensureStylesheetLink` corregidos (`undefined`).
- `src/designer/palette.ts` con categorías y etiquetas nuevas (`aside`, `h4`–`h6`, `select`,
  `label`, `form`, `ul`, `ol`, `li`).
- `src/hooks/useDesigner.ts` con `selectedNode`, `canvasNodes`, `containerId`, `updateText`,
  `setNodeAttr`, `setNodeStyle`, `nodeStyle`, `nodeBox`, `deleteNode` y regla base en insertar.
- `src/components/workspace/design/` reconstruido: `DesignCanvas` (zoom, página, CSS con
  ámbito, imágenes con fallback, error boundary), `DesignTree` (colapsable, bidireccional),
  `DesignPanel` (estructura + paleta), `PropertiesPanel` (nuevo), `design.css` e `index.ts`.
- `src/components/workspace/Workspace.tsx` con layout de 3 columnas en modo Diseño.
- 23 pruebas nuevas. Sin dependencias nuevas, sin cambios en Rust.
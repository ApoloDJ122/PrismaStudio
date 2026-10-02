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
│       └── SearchOverlay.tsx   # apertura rápida (Ctrl+P) y búsqueda (Ctrl+Shift+F)
├── editor/
│   └── monacoEnvironment.ts    # workers de Monaco empaquetados por Vite
├── hooks/
│   ├── useProject.ts           # ciclo de vida del proyecto: crear, abrir, ejecutar, cerrar
│   └── useWorkspace.ts         # búferes, guardado, búsqueda y operaciones de archivos
├── services/
│   └── projects.ts             # invocación de comandos Rust
├── styles/
│   ├── global.css              # reset, variables CSS y botones compartidos
│   ├── ui.css                  # diálogos y pantalla de error
│   └── App.css                 # layout raíz
└── types/
    └── project.ts              # tipos ProjectInfo, ProjectNode, ProjectFile y SearchMatch

src-tauri/src/
├── lib.rs                      # registro de plugins y comandos
├── main.rs                     # punto de entrada
└── projects.rs                 # comandos de proyectos y operaciones sobre archivos
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
| 1 | Proyectos web | En desarrollo (`M1.0.0`, `M1.1.0` y `M1.2.0` completadas) |

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

## Estado actual

Funciona actualmente:

- La aplicación arranca y muestra la pantalla inicial de Prisma.
- **Crear proyecto web** funciona de extremo a extremo: permite escribir un nombre, elegir la
  carpeta de destino, genera físicamente la carpeta con los tres archivos, los enlaza
  correctamente y abre el proyecto creado en el workspace.
- **Abrir proyecto** funciona: permite elegir una carpeta existente y muestra su árbol de archivos.
- El workspace muestra el árbol de archivos real del proyecto y permite seleccionar cada archivo.
- El editor Monaco muestra el contenido real del archivo seleccionado con resaltado de sintaxis
  para HTML, CSS y JavaScript.
- Las modificaciones se guardan en el archivo real del disco mediante el botón `Guardar` o
  `Ctrl + S`, y el estado de guardado se refleja en el árbol (`*`) y en la cabecera.
- `Ejecutar` abre el `index.html` real del proyecto en el navegador predeterminado del sistema.
- Los archivos y carpetas del proyecto se crean, renombran y eliminan físicamente, y el árbol se
  actualiza sin reabrir el proyecto.
- La búsqueda por contenido (`Ctrl + Shift + F`) y la apertura rápida por nombre (`Ctrl + P`)
  recorren el proyecto real.
- `Cerrar proyecto` permite guardar todo, descartar los cambios o cancelar antes de salir.
- Los errores de creación, apertura, lectura, guardado, búsqueda y ejecución se muestran en la
  interfaz en lugar de fallar en silencio.

Comprobaciones realizadas al cerrar `M1.2.0`:

- `npx tsc --noEmit` no informa de errores de tipos.
- `npm run build` (Vite) compila sin errores. El paquete inicial de la interfaz baja de unos
  4,2 MB a unos 251 kB: Monaco queda en fragmentos que se descargan al abrir el primer archivo.
- `cargo build` compila sin errores y `cargo test` en `src-tauri` da 9 pruebas, todas correctas.
  Cubren la creación del proyecto, la lectura y guardado reales, el rechazo de nombres inválidos y
  de duplicados, la creación de archivos y carpetas con actualización del árbol, el renombrado de
  archivos y carpetas conservando el contenido, el borrado de archivos y carpetas, la búsqueda por
  contenido y el rechazo de rutas fuera del proyecto en todas las operaciones.
- `npm run tauri build` genera correctamente los instaladores de Windows (MSI y NSIS).
- La aplicación se ha ejecutado en modo desarrollo (`npm run tauri dev`): la ventana se abre con
  el título `Prisma` y el flujo completo de M1.2.0 responde a través de los comandos de Rust.
- La política de seguridad de contenido (CSP) que se ha añadido a `src-tauri/tauri.conf.json` se ha
  comprobado sirviendo el paquete de producción con esa misma cabecera: la aplicación carga y se
  renderiza sin bloqueos.

Limitaciones conocidas:

- El flujo visual (diálogos, menú contextual, árbol, búsqueda) **no se ha verificado de forma
  automatizada**: no existen pruebas de interfaz. La comprobación de la parte visual requiere una
  revisión manual.
- El árbol omite las entradas que empiezan por `.` y no supera 8 niveles de profundidad.
- Solo hay un archivo abierto a la vez: no hay pestañas, ni divisor, ni historial.
- El árbol no se actualiza solo si los cambios se hacen desde otro programa mientras Prisma está
  abierto: hay que volver a abrir el proyecto.
- La búsqueda recorre los archivos reconocidos por el editor, con un máximo de 200 resultados, y no
  busca dentro de archivos de más de 2 MB.
- Monaco Editor sigue siendo el mayor coste de la aplicación: su fragmento pesa unos 2,7 MB
  (706 kB comprimido), aunque ya no se descarga hasta que se abre un archivo.

## Próximos objetivos

- Recargar el árbol de archivos desde el disco.
- Ampliar el workspace: pestañas y divisor.
- Previsualización del proyecto dentro de la aplicación.
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

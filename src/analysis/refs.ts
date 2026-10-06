/**
 * M2.1.0 - Resolucion de referencias de documentos.
 *
 * Un `<link href>` o un `<script src>` puede apuntar a tres cosas distintas: a
 * un archivo del propio proyecto, a una URL externa o a nada. Aqui se decide
 * cual de los tres casos es y, si toca, se calcula la carpeta que le espera
 * dentro del proyecto.
 *
 * La carpeta de cada archivo es la base de calculo: si `resources/views/home.blade.php`
 * enlaza con `../../css/app.css`, el resultado es `css/app.css`, relativo a la
 * raiz del proyecto y con `/` como separador, que es como guarda Rust las rutas.
 */

/** `true` si la referencia no apunta a un archivo del propio proyecto. */
export function isExternalReference(reference: string): boolean {
  const value = reference.trim();

  if (value === "") {
    return true;
  }

  // Anclas de la propia pagina, por ejemplo `#contacto`.
  if (value.startsWith("#")) {
    return true;
  }

  // Rutas de red o de otro origen, por ejemplo `//cdn...`.
  if (value.startsWith("//")) {
    return true;
  }

  // Cualquier esquema: `https:`, `http:`, `data:`, `mailto:`, `javascript:`.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
    return true;
  }

  return false;
}

/**
 * Resuelve una referencia contra la carpeta del documento.
 *
 * Devuelve la ruta relativa a la raiz con `/`, o `null` cuando no se puede
 * resolver: una URL externa, una referencia vacia o una que se sale de la raiz.
 * Las consultas (`?v=1`) y los fragmentos (`#capa`) se quitan antes de mirar,
 * porque en el disco no forman parte del nombre.
 */
export function resolveReference(documentRelativePath: string, reference: string): string | null {
  const raw = reference.trim().replace(/\\/g, "/");

  if (raw === "" || isExternalReference(raw)) {
    return null;
  }

  const clean = raw.split(/[?#]/)[0] ?? "";

  if (clean === "") {
    return null;
  }

  const folder = documentRelativePath.includes("/")
    ? documentRelativePath.slice(0, documentRelativePath.lastIndexOf("/"))
    : "";

  // Una ruta que empieza por `/` es relativa a la raiz del proyecto, no al documento.
  const parts = clean.startsWith("/")
    ? clean.split("/")
    : `${folder}/${clean}`.split("/");

  const resolved: string[] = [];

  for (const part of parts) {
    if (part === "" || part === ".") {
      continue;
    }

    if (part === "..") {
      if (resolved.length === 0) {
        // Sale de la raiz del proyecto: no es una referencia valida.
        return null;
      }

      resolved.pop();
      continue;
    }

    resolved.push(part);
  }

  if (resolved.length === 0) {
    return null;
  }

  return resolved.join("/");
}

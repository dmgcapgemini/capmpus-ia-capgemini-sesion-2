# Sesiones 1 y 2 — Configuración con SQLite

Utiliza esta vía cuando Podman, Docker o un servidor PostgreSQL no estén disponibles. Bun 1.4.0 incluye el driver de SQLite; no hace falta instalar otra base de datos. Cada miembro utiliza sus propios archivos locales.

## 1. Preparar

Importa el ZIP de la sesión en el repositorio del equipo según `QUICKSTART.md`. Instala Git, Bun 1.4.0 y Copilot CLI, e inicia sesión con `copilot login`. Omite los pasos de PostgreSQL y contenedores para esta vía de las sesiones 1 y 2.

## 2. Configurar

Desde la raíz de la aplicación:

```bash
cp .env.example .env.local
```

Sustituye la línea activa de `DATABASE_URL` por:

```dotenv
DATABASE_URL=sqlite:./.loom/session-02.sqlite
```

Deja `DATABASE_URL_TEST` sin definir para obtener un archivo independiente con el sufijo `_test.sqlite`. Si lo defines explícitamente, utiliza otro archivo SQLite. Nunca utilices el archivo de la aplicación para las pruebas. Las rutas se resuelven desde la raíz de la aplicación. En macOS, sigue la indicación de preflight sobre la ruta del CLI cuando sea necesario.

## 3. Instalar y arrancar

```bash
bun install --frozen-lockfile
bun run db:migrate
bun run db:seed
bun run preflight
bun run typecheck
bun run lint
bun run test
bun run dev
```

La sesión 1 tiene tres ejercicios y 13 fallos previstos; la sesión 2 tiene cuatro ejercicios y 10 fallos previstos. Compara los nombres exactos con `docs/course/session-NN/workshop-tests.json`; todas las demás pruebas deben pasar. La consola de desarrollo se abre normalmente en `http://localhost:5173`.

## 4. Conservar los datos

Las ejecuciones y los análisis guardados persisten en el archivo `.loom/session-NN.sqlite` elegido al reiniciar la API. SQLite también puede crear archivos `-wal` y `-shm`. Git ignora estos archivos y `.env.local`, y los archivos de entrega los excluyen. No borres los datos de la aplicación para corregir un fallo de pruebas.

## 5. Alcance y recuperación

SQLite es la opción predeterminada de las sesiones 1 y 2. PostgreSQL sigue disponible como selección explícita en QUICKSTART.es.md. Cada ZIP completo empieza en una carpeta nueva con sus propios datos; conserva las carpetas y los archivos anteriores sin conversión automática. La sesión 3 requiere preparar PostgreSQL antes de clase.

El ejemplo de URL anterior corresponde a la sesión 2; en la sesión 1 utiliza `sqlite:./.loom/session-01.sqlite`. La sesión 1 tiene tres ejercicios y 13 fallos previstos; la sesión 2 tiene cuatro ejercicios y 10 fallos previstos. Compara los nombres exactos con `docs/course/session-NN/workshop-tests.json`; las demás pruebas deben pasar.

Los cuatro ejercicios de procesos son los mismos en ambas bases. SQLite serializa las transacciones mediante la conexión local de la aplicación; PostgreSQL utiliza bloqueos de fila. Ambos conservan versiones, protección frente a resultados duplicados y cambios atómicos de estado y auditoría. Utiliza un solo proceso API por base.

Para el fixture de la sesión 2, selecciona un archivo independiente como `sqlite:./.loom/session-02_demo.sqlite`. Reinicia contra ese mismo archivo durante la demostración hold/kill/succeed. Después restaura la URL de aplicación habitual. Las pruebas y la validación privada usan otros archivos. Si faltan permisos, utiliza un directorio con escritura y repite migración y preflight. Un fallo de conexión PostgreSQL nunca cambia automáticamente de almacenamiento.

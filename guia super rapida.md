# Guía super rápida

Abre la carpeta del proyecto en VS Code y un terminal dentro de esa carpeta.
Ejecuta los comandos uno a uno y espera a que termine setup antes de usar start.

## SQLite (sin servidor de base de datos)

### Windows · PowerShell 5.1 o 7

Preparar una vez:

```powershell
.\scripts\setup.ps1 --storage sqlite
```

Arrancar:

```powershell
.\scripts\start.ps1
```

### Mac · Terminal

Preparar una vez:

```bash
bash scripts/setup.sh --storage sqlite
```

Arrancar:

```bash
bash scripts/start.sh
```

## Podman + PostgreSQL

### Windows · PowerShell 5.1 o 7

Preparar una vez:

```powershell
.\scripts\setup.ps1 --storage postgres
```

Arrancar:

```powershell
.\scripts\start.ps1
```

### Mac · Terminal

Preparar una vez:

```bash
bash scripts/setup.sh --storage postgres
```

Arrancar:

```bash
bash scripts/start.sh
```

## Requisitos

- Windows: WinGet disponible. Para PostgreSQL, setup instala Podman si falta e intenta instalar WSL con permisos de administrador si no está disponible. Si pide reiniciar, reinicia y repite setup. La virtualización debe estar habilitada en BIOS/UEFI.
- Los scripts PS1 funcionan desde PowerShell 5.1; no necesitas pwsh para ejecutarlos.
- Mac: setup intenta instalar Homebrew si falta y lo necesita para instalar Copilot CLI o Podman. Puede pedir permisos de administrador y herramientas de Apple.
- Setup descarga Bun 1.4.0 si falta. Las herramientas externas conservan sus requisitos.
- Consulta [INSTALLATION.es.md](INSTALLATION.es.md) si falta algún requisito o se pide reiniciar el equipo.

## Uso diario

- Ejecuta solo start para el almacenamiento que ya hayas preparado.
- Abre en el navegador la URL que imprime el terminal; el puerto puede variar.
- Mantén abierto el terminal. Ctrl+C detiene la API y la web y conserva los datos.
- Repetir start sustituye el arranque anterior de esta misma carpeta.
- Detén la aplicación antes de repetir setup.
- Cambiar de SQLite a PostgreSQL o al revés no transfiere los datos.

## Iniciar sesión en Copilot durante setup (opcional)

Windows:

```powershell
.\scripts\setup.ps1 --storage sqlite --login
```

Mac:

```bash
bash scripts/setup.sh --storage sqlite --login
```

Para PostgreSQL, sustituye `sqlite` por `postgres`. Utiliza tu cuenta con permiso de Copilot.

## Pruebas del taller

En el proyecto inicial son normales 111 pruebas correctas y 10 fallos de ejercicios
pendientes. Si aparecen otros fallos, revisa `.loom/setup-tests.json`.

Más opciones y modo demo: [AYUDA-ARRANQUE.es.md](AYUDA-ARRANQUE.es.md).

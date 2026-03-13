# Bitbucket MCP Server

Servidor MCP (Model Context Protocol) para Bitbucket Cloud que expone operaciones de Pull Requests como herramientas para Claude y otros clientes MCP.

## Requisitos previos

- Node.js >= 18
- Una cuenta de Bitbucket Cloud
- Un **App Password** de Bitbucket con permisos de lectura/escritura en Pull Requests

### Crear un App Password

1. Ir a [Bitbucket App Passwords](https://bitbucket.org/account/settings/app-passwords/)
2. Click en **Create app password**
3. Asignar permisos: **Pull requests: Read & Write**, **Repositories: Read**
4. Copiar el token generado

## Instalacion

```bash
git clone <repo-url>
cd bitbucket-mcp-server
npm install
npm run build
```

## Configuracion

Copiar el archivo de ejemplo y completar con tus credenciales:

```bash
cp .env.example .env
```

```env
BITBUCKET_USERNAME=tu-email@ejemplo.com
BITBUCKET_API_TOKEN=tu-app-password
BITBUCKET_WORKSPACE=tu-workspace
```

### Variables de entorno

| Variable | Requerida | Default | Descripcion |
|---|---|---|---|
| `BITBUCKET_USERNAME` | Si | - | Email o username de Bitbucket |
| `BITBUCKET_API_TOKEN` | Si | - | App Password de Bitbucket |
| `BITBUCKET_WORKSPACE` | No | - | Workspace por defecto (evita pasarlo en cada llamada) |
| `BITBUCKET_ENABLE_DANGEROUS` | No | `false` | Habilita operaciones destructivas (merge, decline) |
| `TRANSPORT` | No | `stdio` | Modo de transporte: `stdio` o `http` |
| `PORT` | No | `3000` | Puerto HTTP (solo si `TRANSPORT=http`) |

## Uso como MCP local

### Importante: `node` vs `nvm`

Los clientes MCP lanzan el servidor como un proceso hijo usando el `command` configurado. Esto significa que el binario de `node` debe ser accesible desde la ruta indicada.

- **Si instalaste Node.js directamente** (instalador, Homebrew, etc.), `node` esta disponible globalmente y podes usarlo directamente como command.
- **Si usas `nvm`**, el binario de `node` no esta en una ruta fija global sino dentro de `~/.nvm/versions/node/vXX.X.X/bin/node`. Algunos clientes MCP (como Claude Desktop) no cargan el perfil de tu shell, por lo que `node` no se encuentra.

**Solucion para usuarios de nvm:** usar la ruta absoluta al binario de node. Para obtenerla:

```bash
# Ver la ruta al node activo
which node
# Ejemplo de salida: /Users/tu-usuario/.nvm/versions/node/v22.0.0/bin/node
```

Y usar esa ruta completa en el campo `command` de la configuracion:

```json
{
  "command": "/Users/tu-usuario/.nvm/versions/node/v22.0.0/bin/node"
}
```

> **Nota:** Si actualizas la version de Node con nvm, vas a tener que actualizar esta ruta tambien.

---

### Claude Code

Agregar el servidor a la configuracion de Claude Code:

```bash
claude mcp add bitbucket -- node /ruta/absoluta/a/bitbucket-mcp-server/dist/index.js
```

O manualmente en el archivo de configuracion `~/.claude/settings.json` (global) o `.claude/settings.json` (por proyecto):

```json
{
  "mcpServers": {
    "bitbucket": {
      "command": "node",
      "args": ["/ruta/absoluta/a/bitbucket-mcp-server/dist/index.js"],
      "env": {
        "BITBUCKET_USERNAME": "tu-email@ejemplo.com",
        "BITBUCKET_API_TOKEN": "tu-app-password",
        "BITBUCKET_WORKSPACE": "tu-workspace"
      }
    }
  }
}
```

> Si usas nvm, reemplazar `"node"` por la ruta absoluta (ver seccion anterior).

### Claude Desktop

Agregar en `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) o `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "bitbucket": {
      "command": "node",
      "args": ["/ruta/absoluta/a/bitbucket-mcp-server/dist/index.js"],
      "env": {
        "BITBUCKET_USERNAME": "tu-email@ejemplo.com",
        "BITBUCKET_API_TOKEN": "tu-app-password",
        "BITBUCKET_WORKSPACE": "tu-workspace"
      }
    }
  }
}
```

> Si usas nvm, reemplazar `"node"` por la ruta absoluta (ver seccion "node vs nvm"). Claude Desktop **no** carga el perfil de shell, por lo que `nvm` no estara disponible.

### Cursor / Windsurf / otros editores

La configuracion es similar. Buscar la seccion de MCP servers en la configuracion del editor y agregar:

- **Command:** `node` (o ruta absoluta si usas nvm)
- **Args:** `["/ruta/absoluta/a/bitbucket-mcp-server/dist/index.js"]`
- **Env:** las variables de entorno listadas arriba

### Modo HTTP (alternativo)

Si se necesita un servidor HTTP en lugar de stdio:

```bash
TRANSPORT=http PORT=3000 npm start
```

Endpoints disponibles:
- `POST /mcp` - Recibe requests MCP
- `GET /health` - Health check

## Herramientas disponibles

### Lectura

| Herramienta | Descripcion |
|---|---|
| `list_pull_requests` | Lista PRs de un repositorio (filtrar por estado: OPEN, MERGED, DECLINED, SUPERSEDED) |
| `get_pull_request` | Detalle completo de un PR |
| `get_pull_request_diff` | Diff en formato unificado |
| `get_pull_request_comments` | Comentarios del PR (generales e inline) |
| `get_pull_request_activity` | Log de actividad (cambios de estado, aprobaciones, comentarios) |

### Escritura

| Herramienta | Descripcion |
|---|---|
| `create_pull_request` | Crear un nuevo PR |
| `update_pull_request` | Actualizar titulo, descripcion o reviewers |
| `approve_pull_request` | Aprobar un PR |
| `unapprove_pull_request` | Quitar aprobacion |
| `request_changes` | Solicitar cambios |
| `add_pull_request_comment` | Agregar comentarios (generales, inline en lineas, o respuestas) |

### Operaciones peligrosas (requieren `BITBUCKET_ENABLE_DANGEROUS=true`)

| Herramienta | Descripcion |
|---|---|
| `merge_pull_request` | Mergear un PR (estrategias: merge_commit, squash, fast_forward) |
| `decline_pull_request` | Rechazar un PR |

## Desarrollo

```bash
# Compilar en modo watch
npm run dev

# En otra terminal, probar el servidor
npm start
```

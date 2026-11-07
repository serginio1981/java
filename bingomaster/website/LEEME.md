# Sitio web de Bingo Master (bingomaster.net)

Sitio estático: solo HTML, CSS e imágenes. No usa servidores, bases de datos, cookies,
analítica ni recursos externos.

## Archivos

| Archivo | Contenido |
|---|---|
| `index.html` | Página principal |
| `privacidad.html` | Política de privacidad (generada desde `../PRIVACIDAD.md`) |
| `404.html` | Página de error "no encontrada" |
| `estilos.css` | Estilos (modo claro y oscuro, adaptable a celular) |
| `img/` | Ícono, favicon y capturas de la aplicación |
| `robots.txt`, `sitemap.xml` | Para buscadores |

## Cómo publicarlo

Suba **todo el contenido de esta carpeta** (no la carpeta en sí) a la raíz del dominio, de modo
que `https://bingomaster.net/index.html` y `https://bingomaster.net/privacidad.html` existan.

- **Hosting tradicional (cPanel, FTP):** suba los archivos a `public_html/`.
- **Netlify, Cloudflare Pages o GitHub Pages:** publique esta carpeta como sitio estático.
- Active **HTTPS** en el hosting.
- Para que `404.html` se use en errores, configúrelo en el hosting (por ejemplo, en Apache:
  `ErrorDocument 404 /404.html` en `.htaccess`).

## Después de publicar

1. En Partner Center use como URL de privacidad: `https://bingomaster.net/privacidad.html`
   y como sitio web: `https://bingomaster.net/`.
2. Cuando la app esté en Microsoft Store, en `index.html` cambie el enlace del botón con
   `id="enlace-store"` por la URL de la ficha de la Store y su texto por "Descargar en Microsoft Store".

## Si cambia la política de privacidad

Edite `../PRIVACIDAD.md` y regenere la página con:

```bash
node scripts/build-website.mjs
```

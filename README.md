# Miniciudad 🏘️

Minijuego de simulación: una ciudad de 9 lugares (plaza, 4 casas, 4 negocios) donde los vecinos
tienen características, se relacionan entre sí y van surgiendo eventos día a día.

## Estructura

- `index.html`: la página
- `style.css`: estilos
- `game.js`: lógica del juego
- `data/negocios.json`: pool de negocios que se sortean
- `data/residentes.json`: nombres, edades y características posibles
- `data/eventos.json`: todos los eventos (verde, amarillo, rojo)
- `data/frases.json`: cómo se lee cada característica en los mensajes

## Cómo correrlo

Los JSON se cargan con `fetch`, así que hay que abrirlo desde un servidor (no con doble clic):

- GitHub Pages: funciona directo
- Local: `python -m http.server` en la carpeta y entrar a http://localhost:8000
- VS Code: extensión Live Server

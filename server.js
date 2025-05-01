// server.js
'use strict';
require('dotenv').config(); // Ładuje zmienne środowiskowe z .env
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet'); // Do ustawiania nagłówków bezpieczeństwa
const mongoose = require('mongoose');

const apiRoutes = require('./routes/api.js');
const fccTestingRoutes = require('./routes/fcctesting.js'); // Jeśli używasz boilerplate FCC
const runner = require('./test-runner'); // Jeśli używasz boilerplate FCC

const app = express();

// --- Połączenie z bazą danych ---
mongoose.connect(process.env.DB, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected successfully.'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- Ustawienia bezpieczeństwa (Helmet) ---
// Wymaganie 2: Tylko iframe na własnych stronach
app.use(helmet.frameguard({ action: 'sameorigin' }));
// Wymaganie 3: Wyłącz DNS Prefetching
app.use(helmet.dnsPrefetchControl({ allow: false }));
// Wymaganie 4: Polityka Referrer
app.use(helmet.referrerPolicy({ policy: 'same-origin' }));
// Inne podstawowe zabezpieczenia Helmet
app.use(helmet.hidePoweredBy());
app.use(helmet.xssFilter());
app.use(helmet.noSniff());
app.use(helmet.ieNoOpen());

// --- Middleware ---
app.use('/public', express.static(process.cwd() + '/public')); // Serwowanie plików statycznych
app.use(cors({ origin: '*' })); // Dla testów FCC; w produkcji możesz chcieć to ograniczyć
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // Do przetwarzania danych z formularzy

// --- Routing dla widoków HTML ---
app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/views/index.html');
});

// Strona konkretnej tablicy (board)
app.get('/b/:board/', (req, res) => {
  res.sendFile(process.cwd() + '/views/board.html');
});

// Strona konkretnego wątku
app.get('/b/:board/:threadid', (req, res) => {
  res.sendFile(process.cwd() + '/views/thread.html');
});


// --- Routing dla API ---
apiRoutes(app); // Przekazujemy instancję aplikacji do pliku z trasami API

// --- Routing dla testów FCC (jeśli używasz boilerplate) ---
if (process.env.NODE_ENV === 'test') { // Tylko w trybie testowym
  fccTestingRoutes(app);
}

// --- Obsługa błędów 404 (Not Found) ---
app.use((req, res, next) => {
  res.status(404)
    .type('text')
    .send('Not Found');
});

// --- Start serwera ---
const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port);
  if (process.env.NODE_ENV === 'test') {
    console.log('Running Tests...');
    setTimeout(() => {
      try {
        runner.run(); // Uruchamia testy po starcie serwera (dla boilerplate FCC)
      } catch (e) {
        console.log('Tests are not valid:', e);
      }
    }, 1500); // Daj serwerowi chwilę na start
  }
});

// Eksport na potrzeby testów
module.exports = app;
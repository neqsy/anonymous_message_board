// routes/api.js
'use strict';
const Thread = require('../models/Thread'); // Import modelu wątku
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10; // Pobierz z .env lub użyj wartości domyślnej

module.exports = function (app) {

  // --- THREADS ---

  // Wymaganie 5: Tworzenie nowego wątku
  app.route('/api/threads/:board')
    .post(async (req, res) => {
      const board = req.params.board;
      const { text, delete_password } = req.body;

      if (!text || !delete_password) {
        return res.status(400).send('Missing required fields: text and delete_password');
      }

      try {
        const hashedPassword = await bcrypt.hash(delete_password, SALT_ROUNDS);
        const newThread = new Thread({
          board: board,
          text: text,
          delete_password: hashedPassword,
          created_on: new Date(),
          bumped_on: new Date(),
          replies: []
        });
        await newThread.save();
        // Zamiast zwracać JSON, przekierowujemy na stronę tablicy zgodnie z oczekiwaniami interfejsu użytkownika
        res.redirect(`/b/${board}/`);
      } catch (error) {
        console.error('Error creating thread:', error);
        res.status(500).send('Could not create thread');
      }
    })

    // Wymaganie 7: Pobieranie 10 najnowszych wątków z 3 ostatnimi odpowiedziami
    .get(async (req, res) => {
        const board = req.params.board;
        try {
            const threads = await Thread.find({ board: board })
                .sort({ bumped_on: -1 }) // Sortuj wg daty ostatniej aktywności (malejąco)
                .limit(10)               // Ogranicz do 10 wyników
                .select('-delete_password -reported') // Wyklucz pola hasła i zgłoszenia z głównego wątku
                .lean() // Użyj .lean() dla lepszej wydajności i łatwiejszej modyfikacji obiektu
                .exec(); // Wykonaj zapytanie

            // Ręczne przetwarzanie, aby wybrać 3 najnowsze odpowiedzi i wykluczyć ich pola
            const processedThreads = threads.map(thread => {
                // Sortuj odpowiedzi wg daty utworzenia (malejąco) i weź pierwsze 3
                const recentReplies = thread.replies
                                      .sort((a, b) => b.created_on - a.created_on)
                                      .slice(0, 3)
                                      .map(reply => ({ // Wyklucz pola dla każdej odpowiedzi
                                          _id: reply._id,
                                          text: reply.text,
                                          created_on: reply.created_on
                                      }));

                return {
                    _id: thread._id,
                    text: thread.text,
                    created_on: thread.created_on,
                    bumped_on: thread.bumped_on,
                    replies: recentReplies, // Użyj przetworzonych odpowiedzi
                    replycount: thread.replies.length // Dodaj liczbę odpowiedzi
                };
            });

            res.json(processedThreads);
        } catch (error) {
            console.error('Error fetching threads:', error);
            res.status(500).send('Could not fetch threads');
        }
    })

    // Wymaganie 9: Usuwanie wątku
    .delete(async (req, res) => {
        const board = req.params.board;
        const { thread_id, delete_password } = req.body;

        if (!thread_id || !delete_password) {
            return res.status(400).send('Missing required fields: thread_id and delete_password');
        }

        try {
            const thread = await Thread.findById(thread_id);

            if (!thread) {
                // Zwracamy 'incorrect password' nawet jeśli wątek nie istnieje, aby nie ujawniać informacji
                return res.type('text').send('incorrect password');
            }

            // Porównaj hasła
            const passwordMatch = await bcrypt.compare(delete_password, thread.delete_password);

            if (passwordMatch) {
                await Thread.findByIdAndDelete(thread_id);
                res.type('text').send('success');
            } else {
                res.type('text').send('incorrect password');
            }
        } catch (error) {
             // Obsługa błędu np. nieprawidłowego formatu ID
            if (error instanceof mongoose.Error.CastError) {
                 return res.type('text').send('incorrect password'); // Lub inny odpowiedni komunikat
            }
            console.error('Error deleting thread:', error);
            res.status(500).send('Could not delete thread');
        }
    })

    // Wymaganie 11: Zgłaszanie wątku
    .put(async (req, res) => {
      const board = req.params.board;
      // W PUT ID jest zwykle w req.body, nie w query params
      const { thread_id } = req.body; // Lub report_id jak w przykładzie FCC, ale thread_id jest bardziej logiczne

      if (!thread_id) {
        return res.status(400).send('Missing required field: thread_id');
      }

      try {
        const updatedThread = await Thread.findByIdAndUpdate(
          thread_id,
          { reported: true },
          { new: true } // Zwraca zaktualizowany dokument (opcjonalne)
        );

        if (!updatedThread) {
          // Jeśli wątek o danym ID nie istnieje
          return res.type('text').send('thread not found');
        }

        res.type('text').send('reported');
      } catch (error) {
        // Obsługa błędu np. nieprawidłowego formatu ID
        if (error instanceof mongoose.Error.CastError) {
             return res.type('text').send('thread not found');
        }
        console.error('Error reporting thread:', error);
        res.status(500).send('Could not report thread');
      }
    });

  // --- REPLIES ---

  app.route('/api/replies/:board')
    // Wymaganie 6: Tworzenie nowej odpowiedzi
    .post(async (req, res) => {
      const board = req.params.board;
      const { thread_id, text, delete_password } = req.body;

      if (!thread_id || !text || !delete_password) {
        return res.status(400).send('Missing required fields: thread_id, text, and delete_password');
      }

      try {
        const hashedPassword = await bcrypt.hash(delete_password, SALT_ROUNDS);
        const newReply = {
          // Generujemy _id ręcznie, aby było dostępne od razu
          _id: new mongoose.Types.ObjectId(),
          text: text,
          delete_password: hashedPassword,
          created_on: new Date(),
          reported: false
        };

        // Znajdź wątek i dodaj odpowiedź, aktualizując bumped_on
        const updatedThread = await Thread.findByIdAndUpdate(
          thread_id,
          {
            $push: { replies: newReply },
            $set: { bumped_on: newReply.created_on } // Ustaw bumped_on na czas nowej odpowiedzi
          },
          { new: true } // Zwraca zaktualizowany dokument
        );

        if (!updatedThread) {
          return res.status(404).send('Thread not found');
        }

        // Przekieruj na stronę wątku
        res.redirect(`/b/${board}/${thread_id}`);

      } catch (error) {
         // Obsługa błędu np. nieprawidłowego formatu ID wątku
        if (error instanceof mongoose.Error.CastError) {
             return res.status(404).send('Thread not found');
        }
        console.error('Error creating reply:', error);
        res.status(500).send('Could not create reply');
      }
    })

   // Wymaganie 8: Pobieranie jednego wątku ze wszystkimi odpowiedziami
    .get(async (req, res) => {
        const board = req.params.board;
        const { thread_id } = req.query; // thread_id jest w query params

        if (!thread_id) {
            return res.status(400).send('Missing required query parameter: thread_id');
        }

        try {
            const thread = await Thread.findById(thread_id)
                .select('-delete_password -reported') // Wyklucz z głównego wątku
                .lean() // Użyj lean dla łatwiejszej modyfikacji
                .exec();

            if (!thread) {
                return res.status(404).send('Thread not found');
            }

             // Ręczne przetworzenie odpowiedzi, aby wykluczyć pola
            thread.replies = thread.replies.map(reply => ({
                _id: reply._id,
                text: reply.text,
                created_on: reply.created_on
                // celowo pomijamy delete_password i reported
            }));


            res.json(thread);
        } catch (error) {
            // Obsługa błędu np. nieprawidłowego formatu ID
            if (error instanceof mongoose.Error.CastError) {
                return res.status(404).send('Thread not found');
            }
            console.error('Error fetching thread with replies:', error);
            res.status(500).send('Could not fetch thread');
        }
    })

    // Wymaganie 10: Usuwanie odpowiedzi (zmiana tekstu na '[deleted]')
    .delete(async (req, res) => {
        const board = req.params.board;
        const { thread_id, reply_id, delete_password } = req.body;

        if (!thread_id || !reply_id || !delete_password) {
            return res.status(400).send('Missing required fields: thread_id, reply_id, and delete_password');
        }

        try {
            const thread = await Thread.findById(thread_id);

            if (!thread) {
                return res.type('text').send('incorrect password'); // Lub 'thread not found'
            }

            // Znajdź odpowiedź w tablicy
            const reply = thread.replies.id(reply_id); // Metoda .id() dla subdokumentów

            if (!reply) {
                 return res.type('text').send('incorrect password'); // Lub 'reply not found'
            }

            // Porównaj hasła
            const passwordMatch = await bcrypt.compare(delete_password, reply.delete_password);

            if (passwordMatch) {
                // Zaktualizuj tekst odpowiedzi
                reply.text = '[deleted]';
                await thread.save(); // Zapisz zmiany w całym wątku
                res.type('text').send('success');
            } else {
                res.type('text').send('incorrect password');
            }
        } catch (error) {
            // Obsługa błędu np. nieprawidłowego formatu ID
            if (error instanceof mongoose.Error.CastError) {
                 return res.type('text').send('incorrect password'); // Lub odpowiedni komunikat
            }
            console.error('Error deleting reply:', error);
            res.status(500).send('Could not delete reply');
        }
    })

    // Wymaganie 12: Zgłaszanie odpowiedzi
    .put(async (req, res) => {
      const board = req.params.board;
      const { thread_id, reply_id } = req.body;

      if (!thread_id || !reply_id) {
        return res.status(400).send('Missing required fields: thread_id and reply_id');
      }

      try {
        // Znajdź wątek, następnie zaktualizuj konkretną odpowiedź w nim
        const thread = await Thread.findById(thread_id);

        if (!thread) {
          return res.type('text').send('thread not found');
        }

        const reply = thread.replies.id(reply_id); // Znajdź subdokument

        if (!reply) {
          return res.type('text').send('reply not found');
        }

        // Zaktualizuj pole 'reported' i zapisz cały wątek
        reply.reported = true;
        await thread.save();

        res.type('text').send('reported');

      } catch (error) {
         // Obsługa błędu np. nieprawidłowego formatu ID
        if (error instanceof mongoose.Error.CastError) {
             return res.type('text').send('thread or reply not found');
        }
        console.error('Error reporting reply:', error);
        res.status(500).send('Could not report reply');
      }
    });

};
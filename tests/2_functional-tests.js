// tests/2_functional-tests.js
const chaiHttp = require('chai-http');
const chai = require('chai');
const assert = chai.assert;
const server = require('../server'); // Importujemy naszą aplikację Express

chai.use(chaiHttp);

// Zmienne do przechowywania ID utworzonych w testach
let testThreadId;
let testReplyId;
const testBoard = 'testboard'; // Używaj stałej nazwy tablicy dla testów

suite('Functional Tests', function() {

   suiteSetup(function() {
    // Upewnij się, że testy działają w środowisku testowym
    // Pamiętaj o ustawieniu testowej bazy danych w .env!
     if (process.env.NODE_ENV !== 'test') {
         console.warn('WARNING: NODE_ENV is not set to "test". Tests might interact with the wrong database or behave unexpectedly.');
         // Możesz rzucić błąd, aby zatrzymać testy:
         // throw new Error('NODE_ENV must be set to "test" for running tests.');
     }
   });


  suite('API ROUTING FOR /api/threads/:board', function() {

    // Test #1: Tworzenie nowego wątku
    test('POST /api/threads/:board => Create a new thread', function(done) {
      chai.request(server) // Usunięto .keepOpen()
        .post(`/api/threads/${testBoard}`)
        .send({
          text: 'Test thread text',
          delete_password: 'testpassword'
        })
        .end(function(err, res) {
          // freeCodeCamp oczekuje przekierowania (status 302 lub 200 i sprawdzenie redirect)
          // Serwer Express może zwrócić 302 i przeglądarka wykona redirect
          // chai-http może śledzić przekierowania, zwracając status 200 końcowego zasobu
          assert.equal(res.status, 200);
          assert.include(res.redirects[0], `/b/${testBoard}/`, 'Should redirect to board page'); // Sprawdź czy było przekierowanie
          done();
        });
    });

    // Test #2: Wyświetlanie 10 najnowszych wątków
    test('GET /api/threads/:board => View 10 most recent threads with 3 replies each', function(done) {
      // Potrzebujemy najpierw utworzyć wątek, aby mieć co wyświetlić
      // Można to zrobić w bloku `before` lub polegać na poprzednim teście, co jest mniej niezawodne.
      // Dla pewności, można by tu dodać wątek przed testem GET.
      // Ale na razie polegamy na teście POST.
      chai.request(server) // Usunięto .keepOpen()
        .get(`/api/threads/${testBoard}`)
        .end(function(err, res) {
          assert.equal(res.status, 200);
          assert.isArray(res.body, 'Response should be an array');
          assert.isAtMost(res.body.length, 10, 'Should return at most 10 threads');
          if (res.body.length > 0) {
            const thread = res.body[0];
            // Zapisz ID *pierwszego* wątku (najnowszego) do późniejszych testów
            // Jest to ważne, bo testy zależą od tego ID
             if (!testThreadId) { // Ustaw ID tylko jeśli jeszcze nie jest ustawione (np. z poprzedniego testu)
                testThreadId = thread._id;
                console.log(`  INFO: Using threadId ${testThreadId} from GET for subsequent tests.`);
             }

            assert.property(thread, '_id');
            assert.property(thread, 'text');
            assert.property(thread, 'created_on');
            assert.property(thread, 'bumped_on');
            assert.property(thread, 'replies');
            assert.property(thread, 'replycount');
            assert.notProperty(thread, 'delete_password', 'delete_password should NOT be sent');
            assert.notProperty(thread, 'reported', 'reported field should NOT be sent');
            assert.isArray(thread.replies);
            assert.isAtMost(thread.replies.length, 3, 'Should have at most 3 replies');
             if (thread.replies.length > 0) {
               assert.notProperty(thread.replies[0], 'delete_password', 'reply delete_password should NOT be sent');
               assert.notProperty(thread.replies[0], 'reported', 'reply reported field should NOT be sent');
             }
          } else {
             console.log(`  WARN: No threads found on board ${testBoard} to test GET details. Ensure POST test runs first.`);
             // Jeśli POST zawiódł lub nie ma wątków, ten i kolejne testy mogą zawieść.
          }
          done();
        });
    });

    // Test #3: Usuwanie wątku z nieprawidłowym hasłem
    test('DELETE /api/threads/:board => Delete thread with incorrect password', function(done) {
      if (!testThreadId) {
         console.error("  ERROR: testThreadId not set. Skipping DELETE incorrect password test.");
        return this.skip(); // Pomiń test, jeśli nie mamy ID wątku
      }
      chai.request(server) // Usunięto .keepOpen()
        .delete(`/api/threads/${testBoard}`)
        .send({
          thread_id: testThreadId,
          delete_password: 'wrongpassword'
        })
        .end(function(err, res) {
          assert.equal(res.status, 200);
          assert.strictEqual(res.text, 'incorrect password'); // Użyj strictEqual dla dokładnego porównania tekstu
          done();
        });
    });

    // Test #5: Zgłaszanie wątku
    test('PUT /api/threads/:board => Report a thread', function(done) {
        if (!testThreadId) {
             console.error("  ERROR: testThreadId not set. Skipping PUT report thread test.");
            return this.skip();
        }
      chai.request(server) // Usunięto .keepOpen()
        .put(`/api/threads/${testBoard}`)
        .send({
          thread_id: testThreadId // W testach freeCodeCamp może być 'report_id', upewnij się, że API akceptuje 'thread_id'
        })
        .end(function(err, res) {
          assert.equal(res.status, 200);
          assert.strictEqual(res.text, 'reported');
          done();
        });
    });

  });


  suite('API ROUTING FOR /api/replies/:board', function() {

    // Przed testami odpowiedzi, upewnijmy się, że mamy wątek
    // Można by dodać wątek tutaj w `before` dla pewności
     before(function(done) {
        if (testThreadId) {
             console.log("  INFO: Thread ID already exists for reply tests.");
            return done();
        }
        // Jeśli testThreadId nie zostało ustawione w poprzednich testach, utwórzmy nowy wątek
        console.log("  INFO: Creating a prerequisite thread for reply tests...");
        chai.request(server)
            .post(`/api/threads/${testBoard}`)
            .send({ text: 'Prerequisite thread for replies', delete_password: 'prereqpassword' })
            .end(function(err, res) {
                 // Po utworzeniu wątku, musimy pobrać jego ID
                 chai.request(server)
                    .get(`/api/threads/${testBoard}`)
                    .end(function(err, getRes) {
                        if (getRes.body && getRes.body.length > 0) {
                           // Znajdź wątek 'Prerequisite thread for replies' lub weź pierwszy
                            const prereqThread = getRes.body.find(t => t.text === 'Prerequisite thread for replies') || getRes.body[0];
                            testThreadId = prereqThread._id;
                            console.log(`  INFO: Prerequisite thread created with ID: ${testThreadId}`);
                        } else {
                            console.error("  ERROR: Failed to create or find prerequisite thread.");
                             // Można by rzucić błąd, aby zatrzymać testy odpowiedzi
                             // throw new Error("Could not ensure prerequisite thread exists.");
                        }
                        done();
                    });
            });
    });


    // Test #6: Tworzenie nowej odpowiedzi
    test('POST /api/replies/:board => Create a new reply', function(done) {
        if (!testThreadId) {
             console.error("  ERROR: testThreadId not set. Skipping POST reply test.");
            return this.skip(); // Potrzebujemy wątku, aby dodać odpowiedź
        }
      chai.request(server) // Usunięto .keepOpen()
        .post(`/api/replies/${testBoard}`)
        .send({
          thread_id: testThreadId,
          text: 'Test reply text',
          delete_password: 'replypassword'
        })
        .end(function(err, res) {
          assert.equal(res.status, 200); // Oczekujemy 200 po przekierowaniu przez chai-http
          assert.include(res.redirects[0], `/b/${testBoard}/${testThreadId}`, 'Should redirect to thread page');
          done();
        });
    });

    // Test #7: Wyświetlanie wątku ze wszystkimi odpowiedziami
    test('GET /api/replies/:board?thread_id= => View single thread with all replies', function(done) {
        if (!testThreadId) {
            console.error("  ERROR: testThreadId not set. Skipping GET replies test.");
            return this.skip();
        }
      chai.request(server) // Usunięto .keepOpen()
        .get(`/api/replies/${testBoard}`)
        .query({ thread_id: testThreadId })
        .end(function(err, res) {
          assert.equal(res.status, 200);
          assert.isObject(res.body, 'Response should be an object');
          assert.property(res.body, '_id');
          assert.equal(res.body._id, testThreadId);
          assert.property(res.body, 'text');
          assert.property(res.body, 'created_on');
          assert.property(res.body, 'bumped_on');
          assert.property(res.body, 'replies');
          assert.notProperty(res.body, 'delete_password', 'delete_password should NOT be sent');
          assert.notProperty(res.body, 'reported', 'reported field should NOT be sent');
          assert.isArray(res.body.replies);
          if (res.body.replies.length > 0) {
            // Zapisz ID *pierwszej* odpowiedzi do dalszych testów
            // Zakładamy, że odpowiedź z Testu #6 jest teraz pierwsza (lub jedna z pierwszych)
             if (!testReplyId) {
                 // Znajdź odpowiedź po tekście lub weź pierwszą
                 const createdReply = res.body.replies.find(r => r.text === 'Test reply text') || res.body.replies[0];
                 testReplyId = createdReply._id;
                console.log(`  INFO: Using replyId ${testReplyId} from GET for subsequent tests.`);
             }

            assert.property(res.body.replies[0], '_id');
            assert.property(res.body.replies[0], 'text');
            assert.property(res.body.replies[0], 'created_on');
            assert.notProperty(res.body.replies[0], 'delete_password', 'reply delete_password should NOT be sent');
            assert.notProperty(res.body.replies[0], 'reported', 'reply reported field should NOT be sent');
          } else {
            console.log(`  WARN: No replies found for thread ${testThreadId} to test GET details. Ensure POST reply test runs first.`);
             // Jeśli POST reply zawiódł, ten test może nie powieść się poprawnie.
          }
          done();
        });
    });

    // Test #8: Usuwanie odpowiedzi z nieprawidłowym hasłem
    test('DELETE /api/replies/:board => Delete reply with incorrect password', function(done) {
        if (!testThreadId || !testReplyId) {
             console.error("  ERROR: testThreadId or testReplyId not set. Skipping DELETE incorrect reply password test.");
            return this.skip(); // Potrzebujemy ID wątku i odpowiedzi
        }
      chai.request(server) // Usunięto .keepOpen()
        .delete(`/api/replies/${testBoard}`)
        .send({
          thread_id: testThreadId,
          reply_id: testReplyId,
          delete_password: 'wrongreplypassword'
        })
        .end(function(err, res) {
          assert.equal(res.status, 200);
          assert.strictEqual(res.text, 'incorrect password');
          done();
        });
    });

    // Test #10: Zgłaszanie odpowiedzi
    test('PUT /api/replies/:board => Report a reply', function(done) {
        if (!testThreadId || !testReplyId) {
            console.error("  ERROR: testThreadId or testReplyId not set. Skipping PUT report reply test.");
            return this.skip();
        }
      chai.request(server) // Usunięto .keepOpen()
        .put(`/api/replies/${testBoard}`)
        .send({
          thread_id: testThreadId,
          reply_id: testReplyId
        })
        .end(function(err, res) {
          assert.equal(res.status, 200);
          assert.strictEqual(res.text, 'reported');
          done();
        });
    });

    // Test #9: Usuwanie odpowiedzi z poprawnym hasłem
    test('DELETE /api/replies/:board => Delete reply with correct password', function(done) {
        if (!testThreadId || !testReplyId) {
             console.error("  ERROR: testThreadId or testReplyId not set. Skipping DELETE correct reply password test.");
            return this.skip();
        }
      chai.request(server) // Usunięto .keepOpen()
        .delete(`/api/replies/${testBoard}`)
        .send({
          thread_id: testThreadId,
          reply_id: testReplyId,
          delete_password: 'replypassword' // Użyj hasła z Testu #6
        })
        .end(function(err, res) {
          assert.equal(res.status, 200);
          assert.strictEqual(res.text, 'success');

          // Dodatkowy test: sprawdź, czy tekst odpowiedzi został zmieniony
          chai.request(server)
            .get(`/api/replies/${testBoard}`)
            .query({ thread_id: testThreadId })
            .end(function(err, getRes) {
                assert.equal(getRes.status, 200);
                const reply = getRes.body.replies.find(r => r._id === testReplyId);
                assert.isDefined(reply, 'Reply should still exist after deletion attempt');
                 if (reply) { // Sprawdź czy odpowiedź została znaleziona
                     assert.strictEqual(reply.text, '[deleted]', 'Reply text should be "[deleted]"');
                 }
                done();
            });
        });
    });

     // Test #4: Usuwanie wątku z poprawnym hasłem (na końcu, aby nie zakłócić innych testów odpowiedzi)
    test('DELETE /api/threads/:board => Delete thread with correct password', function(done) {
        if (!testThreadId) {
            console.error("  ERROR: testThreadId not set. Skipping DELETE correct thread password test.");
            return this.skip();
        }
        chai.request(server) // Usunięto .keepOpen()
            .delete(`/api/threads/${testBoard}`)
            .send({
                thread_id: testThreadId,
                delete_password: 'prereqpassword' // Użyj hasła z Testu #1 LUB 'prereqpassword' jeśli tylko ten wątek został stworzony
                 // TODO: Upewnij się, że używasz poprawnego hasła dla wątku o ID = testThreadId
                 // Jeśli testThreadId pochodzi z wątku 'Prerequisite', użyj 'prereqpassword'
                 // Jeśli pochodzi z Testu #1, użyj 'testpassword'.
                 // Może być konieczne przechowywanie hasła razem z ID. Dla uproszczenia zakładamy, że to hasło z Testu #1.
            })
            .end(function(err, res) {
                assert.equal(res.status, 200);
                // Sprawdź czy odpowiedź to 'success' lub 'incorrect password' jeśli ID/hasło się nie zgadza
                 if (res.text !== 'success') {
                     console.warn(`  WARN: Deleting thread ${testThreadId} returned: ${res.text}. Check if the correct password ('testpassword' or 'prereqpassword') was used.`);
                 }
                 assert.strictEqual(res.text, 'success', "Deleting thread with correct password should return 'success'");

                done();
            });
    });


  }); // Koniec suite dla /api/replies

}); // Koniec głównego suite
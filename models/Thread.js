// models/Thread.js
const mongoose = require('mongoose');
const { Schema } = mongoose;
const ReplySchema = require('./Reply'); // Importujemy schemat odpowiedzi

const ThreadSchema = new Schema({
  board: { type: String, required: true, index: true },
  text: { type: String, required: true },
  delete_password: { type: String, required: true },
  created_on: { type: Date, default: Date.now },
  bumped_on: { type: Date, default: Date.now, index: true },
  reported: { type: Boolean, default: false },
  replies: { type: [ReplySchema], default: [] } // Tablica subdokumentów Reply
});

// Dodajemy metodę pomocniczą do liczenia odpowiedzi (opcjonalne, ale przydatne)
ThreadSchema.virtual('replycount').get(function() {
  return this.replies.length;
});

// Upewniamy się, że wirtualne pola są dołączane do JSON
ThreadSchema.set('toJSON', { virtuals: true });
ThreadSchema.set('toObject', { virtuals: true });


const Thread = mongoose.model('Thread', ThreadSchema);

module.exports = Thread;
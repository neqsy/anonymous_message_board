// models/Reply.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const ReplySchema = new Schema({
  text: { type: String, required: true },
  delete_password: { type: String, required: true },
  created_on: { type: Date, default: Date.now },
  reported: { type: Boolean, default: false }
});

// Nie tworzymy modelu dla Reply, bo będzie subdokumentem
module.exports = ReplySchema;
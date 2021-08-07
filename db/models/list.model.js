const mongoose = require('mongoose');

const ListSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        minlength: 1,
        trim: true
    },
    // with auth
    _userId: {      // underscore is convention to show that this field contains an object id
        type: mongoose.Types.ObjectId,
        required: true
    }
});

const List = mongoose.model('List', ListSchema);

module.exports = { List }
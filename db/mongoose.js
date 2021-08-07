// This file will handle the connection logic to the MongoDB database

const mongoose = require('mongoose');

mongoose.Promise = global.Promise;  // Mongoose currently uses BlueBird for their promises. So we are setting it to use the global JavaScript promise instead.

mongoose.connect("mongodb+srv://Chuck:" + process.env.MONGO_ATLAS_PWD + "@cluster0.qkeaj.mongodb.net/myFirstDatabase?retryWrites=true&w=majority",{ 
    useNewUrlParser: true, useUnifiedTopology: true, useCreateIndex: true })
    .then(() => {
        console.log("Connected to MongoDB successfully!");
    }).catch((e) => {
        console.log("Error while attemting to connect to MongoDB");
        console.log(e);
});

// Below 2 lines of code are to prevent deprecation warnings (from MongoDB native driver)
// mongoose.set('useCreateIndex', true);
mongoose.set('useFindAndModify', false);


module.exports = {
    mongoose
};
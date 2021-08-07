const mongoose = require('mongoose');
const _ = require('lodash');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// jwt secret
const jwtSecret = process.env.JWT_SECRET_KEY; // '75850628151167409421tfuybsciyubdi4906102547';

const UserSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        minlength: 1,
        trim: true,
        unique: true
    },
    password: {
        type: String,
        required: true,
        minlength: 8        
    },
    sessions: [{
        token: {
            type: String,
            required: true
        },
        expiresAt: {
            type: Number,
            required: true
        }
    }]
});


//*** INSTANCE METHODS ***/

UserSchema.methods.toJSON = function() {     // to override the default toJSON method
     const user = this;                      // Note: we have used a regular function (and not arrow func.) bcoz
     const userObject = user.toObject();     //   we want access to the this keyword.

     // return the document except the password and sessions (as these shouldn't be made available)
     //   [hence we have overriden the toJSON method which would otherwise return all the fields]
     return _.omit(userObject, ['password','sessions']);   //using a lodash method to return result 
                                                           //  (we pass an array of fields we want to omit). 
}

UserSchema.methods.generateAccessAuthToken = function() {
    const user = this;
    return new Promise((resolve, reject) => {
        // create the JSON Web Token and return that
        jwt.sign({ _id: user._id.toHexString() }, jwtSecret, { expiresIn: "15m" }, (err, token) => {
            if(!err){
                resolve(token);
            }
            else{
                // there is an error
                reject();
            }
        })
    })
}

UserSchema.methods.generateRefreshAuthToken = function() {
    // This method simply generates a 64 byte hex string - it does not save it to DB. saveSessionToDatabase() does that.
    return new Promise((resolve, reject) => {
        crypto.randomBytes(64, (err, buf) => {  // error & buffer
            if(!err) {
                let token = buf.toString('hex');

                return resolve(token) ;
            }
        })
    })
}

UserSchema.methods.createSession = function() {
    let user = this;

    return user.generateRefreshAuthToken().then((refreshToken) => {
        return saveSessionToDatabase(user, refreshToken);
    }).then((refreshToken) => {
        // saved to the database successfully
        // now return the refresh token
        return refreshToken;
    }).catch((e) =>{
        return Promise.reject('Failed to save session to database.\n' + e);
    })
}


//*** MODEL METHODS (static methods) ***/
// these methods can be called on the model and not on an instance of a model (i.e. not user object but a user model class.)

UserSchema.statics.getJWTSecret = () => {
    return jwtSecret;
}

UserSchema.statics.findByIdAndToken = function(_id, token) {
    // finds user by id and token
    // used in auth middleware (verifySession)

    const user = this;

    return user.findOne({
        _id,
        'sessions.token': token
    });
}

UserSchema.statics.findByCredentials = function(email, password) {

    let user = this;

    return user.findOne({ email }).then((user) => {
        if (!user) {
            return Promise.reject();
        }

        return new Promise((resolve, reject) => {
            bcrypt.compare(password, user.password, (err, res) => {
                if(res) {
                    resolve(user);
                }
                else {
                    reject();
                }
            })
        })
    })
}

UserSchema.statics.hasRefreshTokenExpired = (expiresAt) => {
    let secondsSinceEpoch = Date.now() / 1000;  // it is the first time that the Unix timestamp started from (around 1970)
    if (expiresAt > secondsSinceEpoch)
    {
        // has not expired
        return false;
    }
    else {
        // has expired
        return true;
    }
}

//*** MIDDLEWARE***//
// before a user document is saved, this code runs
UserSchema.pre('save', function(next) {
    let user = this;
let costFactor = 10;

if (user.isModified('password')){
    // if the password field has been edited/changed then run this code

    // generate salt and hash password
    bcrypt.genSalt(costFactor, (err, salt) => {
        bcrypt.hash(user.password, salt, (err, hash) => {
            user.password = hash;
            next();
        })
    })
}
else {
    next();
}

})



//*** HELPER METHODS ***/

// Session = Refresh Token + Expiry Time

let saveSessionToDatabase = (user, refreshToken) => {
    // save session to database
    return new Promise((resolve, reject) => {
        let expiresAt = generateRefreshTokenExpiryTime();

        user.sessions.push({ 'token': refreshToken, expiresAt }); // takes user document and pushes this object to session array

        user.save().then(() => {
            // saved session successfully
            return resolve(refreshToken);
        }).catch((e) => {
            reject(e);
        });
    })
}

let generateRefreshTokenExpiryTime = () => {    // generates Unix timestamp for 10 days from now
    let daysUntilExpire = "10";
    let secondsUntilExpire = ((daysUntilExpire * 24) * 60) * 60;
    return ((Date.now() / 1000) + secondsUntilExpire);
}


const User = mongoose.model('User', UserSchema);

module.exports = { User }
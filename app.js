const express = require('express');
const app = express();

const mongoose = require('./db/mongoose');

const bodyParser = require('body-parser');

/* Load in the Mongoose models */
const { List, Task, User } = require('./db/models/models.index');

const jwt = require('jsonwebtoken');


/* MIDDLEWARE - BOC */

/* Load middleware */
app.use(bodyParser.json());

//CORS HEADERS AND MIDDLEWARE
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-access-token, x-refresh-token, _id");
    res.header("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS, PUT, PATCH, DELETE");   //by default, patch method is not allowed. Hence this statement is reqd to allow patch to be used [We are explicitly stating which methods the API we can handle.]

    res.header(     // for exposing the headers in the response object
        'Access-Control-Expose-Headers', 
        'x-access-token, x-refresh-token'
    );

    next();
});

// check whether the request has a valid jwt acces token
let authenicate = (req, res, next) => {
    let token = req.header('x-access-token');

    // verify the jwt
    jwt.verify(token, User.getJWTSecret(), (err, decoded) => {
        if(err) {
            // there is an error
            // jwt is invalid - * DO NOT AUTHENTICATE *
            res.status(401).send(err);
        }
        else {
            // jwt is valid
            req.user_id = decoded._id;
            next();
        }
    })
}


// verify Refresh Token Middleware (which will be verifying the Session)
let verifySession = (req, res, next) => {
    // grab refresh token from request header
    let refreshToken = req.header('x-refresh-token');

    // grab the id from the request header
    let _id = req.header('_id');

    User.findByIdAndToken(_id, refreshToken).then((user) => {
        if(!user) {
            // user not found
            return Promise.reject({
                'error': 'User not found. Make sure that the Refresh Token and User ID are correct.'
            });
        }

        // if code reaches here - User was found
        // therefore the Refresh Token exists in the database - but we still have to check if it has expired or not

        // putting values onto the request object
        req.user_id = _id;
        req.userObject = user;
        req.refreshToken = refreshToken;


        let isSessionValid = false;

        user.sessions.forEach((session) => {
            if (session.token === refreshToken) {
                // check if the session has expired
                if (User.hasRefreshTokenExpired(session.expiresAt) === false) {
                    // refresh token has not expired
                    isSessionValid = true;
                }
            }
        });

        if (isSessionValid) {
            // the Session is VALID - call next() to continue processing this web request
            next();
        }
        else {
            // the session is not valid
            return Promise.reject({
                'error': 'Refresh Token has expired or the Session is invalid'
            })
        }
    }).catch((e) => {
        res.status(401).send(e);   // 401 - means unauthorized
    })
}

/* MIDDLEWARE - EOC */


/* ROUTE HANDLERS */

/* LIST ROUTES */

/**
 * GET /lists
 * Purpose: Get all lists
 */
app.get('/lists', authenicate, (req,res) => {
    // to return array of all lists that belong to the authenticated user only
    List.find({
        _userId: req.user_id
    }).then((lists) => {
        res.send(lists);
    }).catch((e) => {
        res.send(e);
    });
});

/**
 * POST /lists
 * Purpose: Create a list
 */
app.post('/lists', authenicate, (req,res) => {
    // to create a new list and return the new list document back to the user (including the id) 
    // the list info(fields) will be passed via the JSON body
    let title = req.body.title;

    let newList = new List({
        title,
        _userId: req.user_id
    });

    newList.save().then((listDoc) => {
        // the full list document is returned including id
        res.send(listDoc);
    });
});

/**
 * PATCH /lists/:id
 * Purpose: Update a specified list
 */
app.patch('/lists/:id', authenicate, (req,res) => {
    // to update the specified list (list document with id in URL) with the 
    // new values specified in JSON body of the request
    List.findOneAndUpdate({ _id: req.params.id, _userId: req.user_id },{
        $set: req.body      // $set is MongoDB keyword that updates the list that it
                            // finds using preceeding condition(_id: req.params.id) with the contents of req.body object
    }).then(() => {
        res.send({ 'message': 'Updated successfully.'});    // success
    });
});

/**
 * DELETE /lists/:id
 * Purpose: Delete a specified list
 */
app.delete('/lists/:id', authenicate, (req,res) => {
    // to delete the specified list (document with id in URL)
    List.findOneAndRemove({ 
        _id: req.params.id,
        _userId: req.user_id 
    }).then((removedListDocument) => {
        res.send(removedListDocument);

        // delete all the tasks that are in the deleted list
        deleteTasksFromList(removedListDocument._id);
    })
});

/**
 * GET /lists/:listId/tasks
 * Purpose: Get all tasks in a specific list
 */
app.get('/lists/:listId/tasks', authenicate, (req, res) => {
// to get all tasks that belong to a specific list (specified by listId)
    Task.find({
        _listId: req.params.listId
    }).then((tasks) => {
        res.send(tasks);
    })
});

/**
 * GET /lists/:listId/tasks/:taskId
 * Purpose: Get one specific task in a specific list
 */
app.get('/lists/:listId/tasks/:taskId', (req, res) => {
    // to get one specific task that belong to a specific list (specified by listId)
        Task.findOne({
            _id: req.params.taskId,
            _listId: req.params.listId            
        }).then((tasks) => {
            res.send(tasks);
        })
    });

/**
 * POST /lists/:listId/tasks
 * Purpose: Create a new task in a specific list
 */
app.post('/lists/:listId/tasks', authenicate, (req, res) => {
// to create a new task in a list specified by listId

    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list) => {
        if(list) {
            // list object with the specified conditions was found
            // therefore the currently authenticated user can create new tasks
            return true;
        }

        // else - the list object is undefined
        return false;
    }).then((canCreateTask) => {  // canCreateTask will be boolean the value (either true or false) returned from above
        if(canCreateTask) {
            let newTask = Task({        
                title: req.body.title,
                _listId: req.params.listId
            })
        
            newTask.save().then((newTaskDoc) => {
                res.send(newTaskDoc);
            })
        }
        else {
            res.sendStatus(404);    // listId that user is trying to access can't be found
        }
    })
    
})

/**
 * PATCH /lists/:listId/tasks/:taskId
 * Purpose: Update an existing task in a specific list
 */
app.patch('/lists/:listId/tasks/:taskId', authenicate, (req, res) => {
    // to update a specific task (specified by taskId)

    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list) => {
        if(list) {
            // list object with the specified conditions was found
            // therefore the currently authenticated user can make updates to tasks within this list
            return true;
        }

        // else - the list object is undefined
        return false;
    }).then((canUpdateTasks) => {
        if(canUpdateTasks) {
            // the currently authenticated user can update tasks

            Task.findOneAndUpdate(
                {
                    _id: req.params.taskId,
                    _listId: req.params.listId
                }, 
                {
                     $set: req.body
                }
            ).then(() => {
                res.send({message: 'Updated successfully!'})
            })
        }
        else {
            res.sendStatus(404);    // listId that user is trying to access can't be found
        }
    })

});

/**
 * DELETE /lists/:listId/tasks/:taskId
 * Purpose: Delete a task in a specific list
 */
app.delete('/lists/:listId/tasks/:taskId', authenicate, (req, res) => {
    // to delete a specific task (specified by taskId)
    
    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list) => {
        if(list) {
            // list object with the specified conditions was found
            // therefore the currently authenticated user can make updates to tasks within this list
            return true;
        }

        // else - the list object is undefined
        return false;
    }).then((canDeleteTasks) => {
        if(canDeleteTasks) {
            Task.findOneAndRemove({ 
                _id: req.params.taskId,
                _listId: req.params.listId 
            }).then((removedTaskDoc) => {
                res.send(removedTaskDoc);
            })
        }
        else {
            res.sendStatus(404);
        }        
    });
    
});



/* USER ROUTES */

/**
 * POST /users
 * Purpose: Sign up
 */
app.post('/users', (req, res) => {
    // User Sign up

    let body = req.body;
    let newUser = new User(body);

    newUser.save().then(() => {
        return newUser.createSession();
    }).then((refreshToken) => {
        // Session created successfully - refreshToken returned
        // now we generate an access auth token for the user

        return newUser.generateAccessAuthToken().then((accessToken) => {
            // access auth token generated successfully, now we return an object containing both the auth tokens
            return {accessToken, refreshToken}
        });
    }).then((authToken) => {
        // Now we construct and send the response to the user with their auth tokens(both) in the 
        //  header and the user object in the body
        
        res.header('x-refresh-token', authToken.refreshToken)
            .header('x-access-token', authToken.accessToken)
            .send(newUser);
    }).catch((e) => {
        res.status(400).send(e);
    })
})

/**
 * POST /users/login
 * Purpose: Login
 */
app.post('/users/login', (req, res) => {
    let email = req.body.email;
    let password = req.body.password;

    User.findByCredentials(email, password).then((user) => {
        user.createSession().then((refreshToken) => {
            // Session created successfully - refreshToken returned
            // now we generate an access auth token for the user

            return user.generateAccessAuthToken().then((accessToken) => {
                // access auth token generated successfully, now we return an object containing both the auth tokens
                return {accessToken, refreshToken}
            });
        }).then((authToken) => {
            // Now we construct and send the response to the user with their auth tokens(both) in the 
            //  header and the user object in the body

            res.header('x-refresh-token', authToken.refreshToken)
            .header('x-access-token', authToken.accessToken)
            .send(user);
        })
    }).catch((e) => {
        res.status(400).send(e);
    })
})


/**
 * GET /users/me/access-token
 * Purpose: generates and returns an access token
 */
app.get('/users/me/access-token', verifySession, (req, res) => {
    // we know that the user/caller is authenticated [by verifySession()] and we have the user_id & user object available to us
    req.userObject.generateAccessAuthToken().then((accessToken) => {
        // we are providing 2 ways for client to grab access token back: (1) Through the Response Header [hence..
        //  ..we used header(...) and (2) Through the Request Body [hence we used send(...)]. | P.S. if required we can send it only through one of the means also.
        res.header('x-access-token', accessToken).send({ accessToken });
    }).catch((e) => {
        res.status(400).send(e);
    });
})


/* HELPER METHODS */
let deleteTasksFromList = (_listId) => {
    Task.deleteMany({
        _listId
    }).then(() => {
        console.log("Tasks from " + _listId + "were deleted!");
    })
}




// app.listen(3000, () => {     // commented code as part of production changes
//     console.log("Server is listening on port 3000");
// })

module.exports = app;   // production changes
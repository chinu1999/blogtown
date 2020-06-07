require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require('express-session');
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require('mongoose-findorcreate');

const app = express();

app.use(express.static("public"));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({
  extended: true
}));

app.use(session({
  secret: "Our little secret.",
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect("mongodb+srv://shivam_1999:Shivam@cluster0-6tghg.mongodb.net/userDB", {useNewUrlParser: true,useUnifiedTopology: true});
mongoose.set("useCreateIndex", true);

const postSchema = new mongoose.Schema({
  title: String,
  content: String,
  author: String,
  email: String,
  date: String,
  about: String
});

const Post = new mongoose.model("Post", postSchema);

const userSchema = new mongoose.Schema ({
  username: String,
  fullName: String,
  password: String,
  googleId: String
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = new mongoose.model("User", userSchema);

passport.use(User.createStrategy(
	function(username, password, done) {

		//Search for user
		User.find({ where: {username: username,fullName: fullName} }).success(function(user) {

			//If no user register a new one
			if (!user) {

				var today = new Date();
				var salt = today.getTime();
				var createdDate = today.toUTCString();

				var newPass = crypto.hashPassword(password, salt);

				var user = User.build({
          fullName: fullName,
					username: username,
					password: newPass,
					salt: salt
				});

				user.save().success(function(savedUser) {
					console.log('Saved user successfully: %j', savedUser);
					return done(null, savedUser);

				}).error(function(error) {
					console.log(error);
					return done(null, false, { message: 'Something went wrong in registration' });
				});
			}

			//Found user check password
			if (!crypto.validPassword(password, user)) {
				console.log('In password check');
				return done(null, false, { message: 'Invalid password' });
			}

			console.log("Out local strategy");
			return done(null, user);
		});
	}
));

// passport.use(User.createStrategy());

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "https://blogtown.herokuapp.com/auth/google/blogs",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ googleId: profile.id, username: profile.displayName, fullName: profile.displayName }, function (err, user) {
      return cb(err, user);
    });
  }
));

app.get("/", function(req, res){
  res.render("home");
});

app.get("/auth/google",
  passport.authenticate('google', { scope: ["profile"] })
);

app.get("/auth/google/blogs",
  passport.authenticate('google', { failureRedirect: "/login" }),
  function(req, res) {
    res.redirect("/blogs");
  });


app.get("/", function(req, res){
  res.render("home");
});

app.get("/register", function(req, res){
  res.render("register");
});

app.post("/register", function(req, res){

  User.register({username: req.body.username,fullName: req.body.fullName}, req.body.password, function(err, user){
    if (err) {
      console.log(err);
      res.redirect("/register");
    } else {
      passport.authenticate("local")(req, res, function(){
        res.redirect("/blogs");
      });
    }
  });

});

app.get("/login", function(req, res){
  res.render("login");
});


app.post("/login", function(req, res){

  const user = new User({
    username: req.body.username,
    password: req.body.password
  });

  req.login(user, function(err){
    if (err) {
      console.log(err);
    } else {
      passport.authenticate("local")(req, res, function(){
        res.redirect("/blogs");
      });
    }
  });

});

app.get("/blogs", function(req, res){
  if(req.isAuthenticated()){
    Post.find({}, function(err, foundPosts){
      if (err){
        console.log(err);
      } else {
        if (foundPosts) {
          res.render("blogs",{posts:foundPosts});
        }
      }
    });
  } else {
    res.redirect("/login");
  }
});

app.get("/compose", function(req, res){
  User.find({"compose": {$ne: null}}, function(err, foundUsers){
    if (err){
      console.log(err);
    } else {
      if (foundUsers) {
        res.render("compose");
      }
    }
  });
});

app.post("/compose", function(req, res){
  var today = new Date();
  var createdDate = today.toDateString();
  const post = new Post({
    title: req.body.postTitle,
    content: req.body.postBody,
    author: req.user.fullName,
    email: req.user.username,
    date: createdDate,
    about: req.body.postAbout
  });
  post.save();
  res.redirect("/blogs");
});

app.get("/logout", function(req, res){
  req.logout();
  res.redirect("/");
});


app.get("/posts/:postId", function(req, res){

const requestedPostId = req.params.postId;

  Post.findOne({_id: requestedPostId}, function(err, post){
    res.render("post", {
      title: post.title,
      content: post.content,
      author: post.author,
      date: post.date,
      about: post.about
    });
  });

});

app.get("/profile", function(req, res){
  if(req.isAuthenticated()){
    User.find({_id:req.user._id}, function(err, foundUser){
      if (err){
        console.log(err);
      } else {
        if (foundUser) {
          Post.find({email:req.user.username}, function(err, foundPosts){
            if (err){
              console.log(err);
            } else {
              if (foundPosts) {
                res.render("profile",{info:foundUser,posts:foundPosts});
              } else {
                res.render("profile",{info:foundUser,posts:foundPosts});
              }
            }
          });
        }
      }
    });
  } else {
    res.redirect("/login");
  }
});

app.post("/profile/:action", function(req, res){
    if (req.param('action') === 'read') {
              res.redirect("/posts/"+req.body.name);
      }
      if (req.param('action') === 'update') {
        Post.findOne({_id: req.body.name}, function(err, post){
          res.render("edit", {
            title: post.title,
            content: post.content,
            about: post.about,
            value: post._id
          });
        });
        }
        if (req.param('action') === 'delete') {
          Post.deleteOne({ _id: req.body.name }, function(err) {
            if (!err) {
                    res.redirect("/profile");
            }
        });
          }

});


app.post("/edit", function(req, res){
  var today = new Date();
  var createdDate = today.toDateString();
  const post = new Post({
    title: req.body.postTitle,
    content: req.body.postBody,
    author: req.user.fullName,
    email: req.user.username,
    date: createdDate,
    about: req.body.postAbout
  });
  post.save();
  Post.deleteOne({ _id: req.body.button }, function(err) {
    if (!err) {
            res.redirect("/blogs");
    } else {
      console.log(err);
    }
});
});

let port = process.env.PORT;
if (port == null || port == "") {
  port = 3000;
}

app.listen(port, function() {
  console.log("Server started successfully");
});

import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import cors from "cors";
import jwt from "jsonwebtoken"
import User from "./models/userModel.js";
import crypto from "crypto";
import http from "http";
import { Server } from 'socket.io';
import { Message } from "./models/messageModel.js";
const app = express();
const PORT = 8000;

app.use(cors())
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json());

const dbConnect = async () => {
    try {
        const connect = await mongoose.connect("mongodb+srv://ajmal:ajmal@cluster0.nsrfk5v.mongodb.net/")
        console.log("Connected", connect.connection.host);
    } catch (error) {
        console.log(error);
    }
}
app.get("/test", (req, res) => {
    res.json({ msg: "running" })
})

app.post("/register", async (req, res) => {
    console.log("hitted");
    const { name, email, password, image } = req?.body;
    if ([name, email, password, image].some((field) => field.trim() === "")) {
        throw new Error("All fields required")
    }
    const newUser = User.create({
        email,
        name,
        image,
        password
    }).then(() => {
        res.status(200).json({
            message: "User is been created successfully!"
        })
    }).catch((error) => {
        console.log(error);
        res.status(500).json({
            message: "User is not created!"
        })
    })
})

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req?.body;

        const user = await User.findOne({ email: email });

        if (!user) {
            return res.status(401).json({
                message: "Invalid email"
            })
        }
        if (user.password !== password) {
            return res.status(401).json({
                message: "Incorrect password"
            })
        }
        const secretKey = crypto.randomBytes(32).toString('hex')
        const token = jwt.sign({ userId: user._id }, secretKey)
        res.status(200).json({ token })

    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: "error while login"
        })
    }
})


app.get("/users/:userId", async (req, res) => {
    try {
        console.log("userId vanthach");
        const userId = req.params.userId;
        const users = await User.find({ _id: { $ne: userId } })
        res.json(users)
    } catch (error) {
        console.log(error);
    }
})

app.post("/sendRequest", async (req, res) => {
    console.log("mowneeee");
    const { senderId, recieverId, message } = req?.body;
    console.log(senderId, recieverId, message);
    const reciever = await User.findById(recieverId);
    if (!reciever) {
        return res.status(404).json({ message: "reciever not found" })
    }

    reciever.requests.push({ from: senderId, message })

    await reciever.save();

    res.status(200).json({ message: "request has ben send successfully" })
})
app.get("/get-requests/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;
        const user = await User.findById(userId).populate("requests.from", "name email image")
        if (user) {
            res.status(200).json({
                requests: user.requests
            })
        } else {
            res.status(400);
            throw new Error("User not found")
        }
    } catch (error) {
        console.log(error);
    }
})
app.post("/accept-request", async (req, res) => {
    try {
        const { userId, requestId } = req?.body;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(400).json({ message: "user not found" })
        }
        const updatedUser = await User.findByIdAndUpdate(userId, {
            $pull: { requests: { from: requestId } },

        }, { new: true }
        )
        if (!updatedUser) {
            return res.status(404).json({ message: "request not found" })
        }
        await User.findByIdAndUpdate(userId, {
            $push: { friends: requestId }
        })
        const friendUser = await User.findByIdAndUpdate(requestId, {
            $push: { friends: userId }
        });

        if (!friendUser) {
            return res.status(404).json({ message: "friend not found" })
        }
        res.status(200).json({
            message: "request accepted successfully"
        })
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server Error" })
    }
})



app.get("/user/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;
        const user = await User.findById(userId).populate("friends", "name email image")

        res.json(user.friends)
    } catch (error) {
        console.log('error in while', error);
    }
})








const server = http.createServer(app);

const io = new Server(server);

const userSocketMap = {};

io.on('connection', socket => {
  console.log('a user is connected', socket.id);

  const userId = socket.handshake.query.userId;

  console.log('userid', userId);

  if (userId !== 'undefined') {
    userSocketMap[userId] = socket.id;
  }

  console.log('user socket data', userSocketMap);

  socket.on('disconnect', () => {
    console.log('user disconnected', socket.id);
    delete userSocketMap[userId];
  });

  socket.on('sendMessage', ({ senderId, receiverId, message }) => {
    const receiverSocketId = userSocketMap[receiverId];

    console.log('receiver Id', receiverId);

    if (receiverSocketId) {
      io.to(receiverSocketId).emit('receiveMessage', {
        senderId,
        message,
      });
    }
  });
});





app.post("/send-message",async(req,res)=>{
    try {
         const {senderId,receiverId,message}=req?.body;
         console.log(senderId,receiverId,message);
         const newMessage=Message.create({
            senderId:senderId,
            receiverId:receiverId,
            message:message
         });   
        
         const receiverSocketId=userSocketMap[receiverId];
         if (receiverSocketId) {
            console.log("emittin reciver message event to the reciever:",receiverId);
            io.to(receiverSocketId).emit("newMessage",newMessage)
         }else{
            console.log("Receiver socket ID not found");
         }

         res.status(201).json({message:"message sended successfully"})
         

    } catch (error) {
        console.log("Error at send-message",error);
    }
})


app.post("/get-messages",async(req,res)=>{
    try {
        const {senderId,receiverId}=req?.body;
        console.log(senderId,receiverId);
        const messages=await Message.find({
            $or:[
                {senderId:senderId,receiverId:receiverId},
                {senderId:receiverId,receiverId:senderId}
            ]
        }).populate('senderId',"_id name");

        res.status(200).json(messages)

    } catch (error) {
        console.log("error at get messages api",error);
    }
})












// server.listen(3000, () => {
//   console.log('Socket.IO running on port 3000');
// });







dbConnect().then(() => {
    server.listen(PORT, () => {
        console.log(`server is listening on port ${PORT}`);
    })
})




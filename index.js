const express = require("express")
const app = express();
const cors = require("cors");
var jwt = require('jsonwebtoken');
require('dotenv').config()
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 5000;


const corsOptions = {
  origin: '*',
  credentials: true,
  optionSuccessStatus: 200,
}

app.use(cors(corsOptions))
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorization access' })
  }

  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: "unauthorize access" })
    }
    req.decoded = decoded;
    next()
  })
}

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gmvhoig.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const bistroCollection = client.db('bistroDB').collection('menu');
    const revewCollection = client.db('bistroDB').collection('review');
    const cartCollection = client.db('bistroDB').collection('carts');
    const userCollection = client.db('bistroDB').collection('users');
    const paymentCollection = client.db('bistroDB').collection('pay');

    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1h'
      })
      res.send(token)
    })

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await userCollection.findOne(query);
      if (user.role !== 'admin') {
        return res.status(403).send({ error: true, message: "Forviden message" })
      }
      next()
    }

    app.get('/users', async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result)
    })
    app.delete('/users/:id', async (req, res) => {

      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await userCollection.deleteOne(query);
      res.send(result)
    })

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      console.log("wxisting user", existingUser);
      if (existingUser) {
        return res.send({ message: "User allready Exists" })
      }
      const result = await userCollection.insertOne(user);
      res.send(result)
    })

    app.get('/menu', async (req, res) => {
      const result = await bistroCollection.find().toArray();
      res.send(result)
    })
    app.get('/menu/:id', async (req, res) => {
      const id = req.params.id;
      // const query = {_id: new ObjectId(id)}
      const result = await bistroCollection.find({_id: id}).toArray();
      res.send(result)
    })

    app.post('/menu',verifyJWT, verifyAdmin, async(req, res)=>{
      const newItem = req.body;
      const result  = await bistroCollection.insertOne(newItem);
      res.send(result);
    })

    app.delete('/menu/:id', verifyJWT, verifyAdmin, async(req, res)=>{
      const id = req.params.id;
      const query = {_id: id};
      const result  = await bistroCollection.deleteOne(query);
      res.send(result)
    })

    app.post('/create-payment-intent',verifyJWT, async(req, res)=>{
      const {price} = req.body;

      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency : 'usd',
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    // payment related
    app.post('/payments', async(req, res)=>{
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);

      const query = {_id: {$in: payment.cardItems.map(id=> new ObjectId(id))}}
      const deleteResult = await cartCollection.deleteMany(query)

      res.send({insertResult, deleteResult})
    })

    app.get('/review', async (req, res) => {
      const result = await revewCollection.find().toArray();
      res.send(result)
    })

    app.get('/carts', verifyJWT, async (req, res) => {
      const email = req.query.email;
      console.log(email);
      if (!email) {
        res.send([]);
      }

      const decodedEmal = req.decoded.email;

      if (email !== decodedEmal) {
        return res.status(401).send({ error: true, message: "Forbidden  access" })
      }
      const query = { email: email }
      const result = await cartCollection.find(query).toArray();
      res.send(result)
    })

    app.post('/carts', async (req, res) => {
      const itemn = req.body;
      console.log(itemn);
      const rsult = await cartCollection.insertOne(itemn);
      res.send(rsult)
    })

    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      console.log(req.params);
      console.log(req.decoded.email);
      
      if (req.decoded.email !== email) {
       return res.send({ admin: false })
      }

      const query = { email: email }

      const user = await userCollection.findOne(query);
      console.log(user);
      const result = { admin: user?.role === "admin" };
      console.log(result);
      res.send(result)
    })

    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = { _id: new ObjectId(id) };
      const update = {
        $set: {
          role: 'admin'
        },
      };
      const result = await userCollection.updateOne(filter, update);
      res.send(result)
    })

    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await cartCollection.deleteOne(query);
      res.send(result)
    })

    app.get('/admin-stats',verifyJWT,verifyAdmin, async(req, res)=>{
      const user = await userCollection.estimatedDocumentCount();
      const products= await bistroCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount()

      const payments = await paymentCollection.find().toArray();
      const revinue = payments.reduce((sum, pay)=> sum + pay.price,0)
      res.send({ revinue,user, products, orders})
    })


    app.get('/order-stats',async(req, res)=>{
    const pipeline = [
      {
        $lookup: {
          from: 'menu',
          localField: 'menuItems',
          foreignField: '_id',
          as: 'menuItems',
        },
      },
      { $unwind: '$menuItems' },
      {
        $group: {
          _id: '$menuItems.category',
          count: { $sum: 1 },
          totalPrice: {$sum: '$menuItems.price'}
        },
      },
      {
        $project:{
          category: '$_id',
          count: 1,
          total: {
            $round:['$total', 1]
          },
          _id: 0
        }
      }
    ];
    // console.log(totalPrice);

    const result  = await paymentCollection.aggregate(pipeline).toArray();
    res.send(result)

    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send("Boss is running")
})

app.listen(port, () => {
  console.log('this server running on 5000')
})
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mrvtr8q.mongodb.net/?retryWrites=true&w=majority`;

// middle ware
app.use(express.json());
app.use(cors());

const verifyJwt = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res
      .status(403)
      .send({ error: true, message: 'unauthorized access' });
  }
  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.AC_TOKEN, (err, decode) => {
    if (err) {
      return res
        .status(403)
        .send({ error: true, message: 'unauthorized access' });
    }
    req.decode = decode;
    next();
  });
};

// jwt api
app.post('/jwt', (req, res) => {
  const email = req.body;
  const token = jwt.sign(email, process.env.AC_TOKEN, { expiresIn: '5h' });
  res.send({ token });
});

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const serviceCollection = client.db('parlour').collection('services');
    const bookingCollection = client.db('parlour').collection('bookings');
    const userCollection = client.db('parlour').collection('users');

    // user apis
    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const userLocal = await userCollection.findOne(query);
      if (user?.email === userLocal?.email) {
        return {};
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.patch('/users/:email', async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const updatedUser = {
        $set: {
          role: 'admin',
        },
      };
      const result = await userCollection.updateOne(filter, updatedUser);
      res.send(result);
    });
    //  admin apis route
    app.get('/admin/:email', async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const result = { admin: user?.role === 'admin' };
      res.send(result);
    });

    // service apis

    app.post('/services', async (req, res) => {
      const service = req.body;
      const result = await serviceCollection.insertOne(service);
      res.send(result);
    });

    app.get('/services', async (req, res) => {
      const result = await serviceCollection.find().toArray();
      res.send(result);
    });

    app.get('/services/:id', verifyJwt, async (req, res) => {
      const id = req.params.id;

      if (id === 'null') {
        return res.send({});
      }
      const query = { _id: new ObjectId(id) };
      const result = await serviceCollection.findOne(query);
      res.send(result);
    });

    app.delete('/services/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await serviceCollection.deleteOne(query);
      res.send(result);
    });

    // booking apis history
    app.post('/bookings', async (req, res) => {
      const booking = req.body;
      const result = await bookingCollection.insertOne(booking);
      res.send(result);
    });

    app.get('/bookings', async (req, res) => {
      const email = req.query.email;
      let query = {};
      if (email) {
        query = { email: email };
      }
      const result = await bookingCollection.find(query).toArray();
      res.send(result);
    });

    app.patch('/bookings/:id', async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;

      const filter = { _id: new ObjectId(id) };
      const updatedSta = {
        $set: {
          status: status,
        },
      };
      const result = await bookingCollection.updateOne(filter, updatedSta);
      res.send(result);
    });

    // payment apis
    app.post('/payment-secret', verifyJwt, async (req, res) => {
      const { price } = req.body;
      if (price) {
        const amount = price * 100;
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: 'usd',
          payment_method_types: ['card'],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('jerins parlour is running');
});

app.listen(port, () => {
  console.log('server is running on port', port);
});

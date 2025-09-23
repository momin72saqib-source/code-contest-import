// Updated to import only necessary modules
const mongoose = require("mongoose");
const { app } = require("./backend/server"); // Import only `app`
const axios = require("axios");
const supertest = require("supertest");

// ...existing code...
const swaggerJsdoc = require("swagger-jsdoc");



const options = {
definition: {
openapi: "3.0.0",


    info: {
        title: "Village Location API",
        version: "1.0.0",
        description:
            "Production-style hierarchical village location API with authentication, caching, and autocomplete support.",
    },

    servers: [
        {
             url: process.env.NODE_ENV === "production"
            ? "https://village-location-api.onrender.com"
            : "http://localhost:3000",
        },
    ],

    components: {
        securitySchemes: {
            ApiKeyAuth: {
                type: "apiKey",
                in: "header",
                name: "X-API-Key",
            },
        },
    },

    security: [
        {
            ApiKeyAuth: [],
        },
    ],
},

apis: ["./routes/*.js"],


};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;

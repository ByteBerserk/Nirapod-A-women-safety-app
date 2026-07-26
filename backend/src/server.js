import dotenv from "dotenv";
import connectDB from "./config/database.js";
import app from "./app.js";

dotenv.config({
    path: "./.env"
});

const startServer = async () =>{
    try {
        await connectDB(); 
        const port = Number(process.env.PORT) || 5000;
        const server = app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });
        server.on("error", (error) => {
            if (error.code === "EADDRINUSE") {
                console.log(`Port ${port} is already in use. Please stop the other service or set a different PORT.`);
            } else {
                console.log("Error starting the server:", error);
            }
            process.exit(1);
        });
    } catch (error) {
        console.log("Failed to connect to the database", error);
        process.exit(1);
    }};     
    // Load environment variables from .env file
    startServer();
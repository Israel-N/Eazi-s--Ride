# Ridefast App

Ridefast is a real-time ride-hailing application built with a Node.js (Express, Socket.IO) backend and a React (TypeScript, Tailwind CSS) frontend.

## Features

**Backend:**
- User authentication (Register, Login)
- Rider and Driver roles
- Ride request and acceptance via Socket.IO
- Real-time driver location updates
- MongoDB for data storage

**Frontend:**
- User-friendly interface for riders to request rides
- Driver dashboard to view and accept ride requests
- Real-time updates for ride status
- Protected routes based on user roles

## Technologies Used

**Backend:**
- Node.js
- Express.js
- Socket.IO
- TypeScript
- MongoDB (via Mongoose)
- JSON Web Tokens (JWT) for authentication
- Dotenv for environment variables

**Frontend:**
- React.js
- TypeScript
- Vite (build tool)
- Tailwind CSS (for styling)
- Axios (for API requests)
- Socket.IO Client
- React Router DOM

## Setup and Installation

Follow these steps to set up and run the Ridefast application locally.

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- MongoDB instance (local or cloud-hosted)

### 1. Clone the Repository

```bash
git clone <repository-url>
cd ridefast
```

### 2. Backend Setup

Navigate to the `backend` directory:

```bash
cd backend
```

Install dependencies:

```bash
npm install
# or yarn install
```

Create a `.env` file in the `backend` directory and add the following environment variables:

```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/ridefast
JWT_SECRET=your_jwt_secret_key
FRONTEND_URL=http://localhost:5173
```

Build and start the backend server:

```bash
npm run build
npm start
# or for development with hot-reloading:
npm run dev
```

The backend server will run on `http://localhost:5000`.

### 3. Frontend Setup

Open a new terminal and navigate to the `frontend` directory:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
# or yarn install
```

Create a `.env` file in the `frontend` directory and add the following environment variables:

```
VITE_API_URL=http://localhost:5000
```

Start the frontend development server:

```bash
npm run start
# or yarn start
```

The frontend application will run on `http://localhost:5173`.

## Usage

1.  **Register:** Create an account as either a `rider` or a `driver`.
2.  **Login:** Log in with your registered credentials.
3.  **Rider:** If logged in as a rider, you can request a ride by entering pickup and dropoff coordinates.
4.  **Driver:** If logged in as a driver, go to the Driver Dashboard, set your location, and go online to receive ride requests. You can then accept pending requests.

## Project Structure

```
ridefast/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── authController.ts
│   │   │   └── rideController.ts
│   │   ├── middleware/
│   │   │   └── authMiddleware.ts
│   │   ├── models/
│   │   │   ├── Ride.ts
│   │   │   └── User.ts
│   │   ├── routes/
│   │   │   ├── authRoutes.ts
│   │   │   └── rideRoutes.ts
│   │   ├── sockets/
│   │   │   └── rideSockets.ts
│   │   └── index.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── .env (create this file)
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Navbar.tsx
│   │   │   └── RideCard.tsx
│   │   ├── context/
│   │   │   └── AuthContext.tsx
│   │   ├── hooks/
│   │   │   └── useSocket.ts
│   │   ├── pages/
│   │   │   ├── DriverDashboardPage.tsx
│   │   │   ├── HomePage.tsx
│   │   │   ├── LoginPage.tsx
│   │   │   ├── RegisterPage.tsx
│   │   │   ├── RequestRidePage.tsx
│   │   │   └── RidesPage.tsx
│   │   ├── services/
│   │   │   ├── api.ts
│   │   │   └── socket.ts
│   │   ├── utils/
│   │   │   └── cn.ts
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── vite.config.ts
└── README.md
```

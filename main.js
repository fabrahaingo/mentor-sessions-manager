import axios from 'axios'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
dotenv.config()

const sessionSchema = new mongoose.Schema({
   projectLevel: Number,
   expert: {
      displayableName: String,
      id: Number,
      profilePicture: String,
      publicId: String
   },
   id: { type: Number, unique: true, required: true },
   recipient: {
      displayableName: String,
      id: Number,
      profilePicture: String,
      publicId: String
   },
   sessionDate: String,
   lifeCycleStatus: String,
   status: String,
   type: String,
   videoConference: Object
})
const Session = mongoose.model('Session', sessionSchema)

async function startMongoDb() {
   await mongoose
      .connect('mongodb://localhost:27017/openclassrooms')
      .catch((err) => console.log(err))
}

function isFutureSession(data) {
   const now = new Date()
   const sessionDate = new Date(data.sessionDate)
   return now < sessionDate ? true : false
}

function isSessionCompleted(data) {
   return data.status === 'completed' && data.lifeCycleStatus === 'completed'
      ? true
      : false
}

async function isDataUpToDate(session) {
   return await Session.findOne({ id: session.id })
      .then((result) => {
         if (
            result.status === session.status &&
            result.lifeCycleStatus === session.lifeCycleStatus
         ) {
            return true
         } else {
            console.log('Program stopped because all sessions are up to date')
            return false
         }
      })
      .catch((err) => {
         console.log(err)
      })
}

async function updateSession(data) {
   return await Session.findOne({ id: data.id })
      .select({ _id: 0, __v: 0 })
      .then((result) => {
         if (isFutureSession(data)) {
            console.log(`Skipped ${data.id} because its in the future`)
         } else if (isSessionCompleted(data) && !isSessionCompleted(result)) {
            Session.updateOne({ id: data.id }, data)
               .then(() => {
                  console.log(`Session ${data.id} updated (report was made))`)
               })
               .catch((err) => {
                  console.log(err)
               })
         } else {
            console.log('Session up to date')
         }
      })
      .catch((err) => {
         console.log(err)
      })
}

async function saveToDb(data) {
   const session = new Session({
      ...data
   })
   await session
      .save()
      .then((result) => {
         console.log(`Session ${result.id} was added to db`)
      })
      .catch(async (err) => {
         // if duplicateError
         if (err.code === 11000) {
            await updateSession(data)
         } else {
            console.log(err)
         }
      })
}

async function getSessions(sessionsRequest, token, before) {
   if (!before) {
      before = new Date()
      before.setMonth(before.getMonth() + 1)
      before = before.toISOString().slice(0, -5) + 'Z'
   } else {
      before = before.slice(0, -5) + 'Z'
   }
   await axios
      .get(`${sessionsRequest}?before=${before}`, {
         headers: { Authorization: `Bearer ${token}` }
      })
      .then(async (result) => {
         if (result.data.length === 0) {
            return
         } else {
            for (let session of result.data) {
               await saveToDb(session)
            }
            console.log(`Sessions before ${before} were parsed and saved`)
            let continueFunction = !(await isDataUpToDate(
               result.data[result.data.length - 1]
            ))
            if (continueFunction) {
               await getSessions(
                  sessionsRequest,
                  token,
                  result.data[result.data.length - 1].sessionDate
               )
            }
         }
      })
      .catch((error) => {
         console.log(error.message)
      })
}

async function main(sessionsRequest, token) {
   startMongoDb()
   await getSessions(sessionsRequest, token)
   console.log('Update finished')
}

const token = process.env.OC_USER_TOKEN
const userId = process.env.OC_USER_ID
const sessionsRequest = `https://api.openclassrooms.com/users/${userId}/sessions`
main(sessionsRequest, token)

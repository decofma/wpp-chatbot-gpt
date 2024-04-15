import qrcode from 'qrcode-terminal'
import dotenv from 'dotenv'
import fs from 'fs/promises';
import OpenAI from "openai";
import { createReadStream } from 'fs'
import WAWebJS from 'whatsapp-web.js'
import { randomUUID } from 'crypto'
import { exec } from 'child_process'
import { resolve } from 'path';

dotenv.config()
const { Client } = require('whatsapp-web.js');
const client = new Client({
  webVersionCache: {
    type: "remote",
    remotePath:
      "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
  },
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function decodeBase64ToBuffer(base64String: string) {
  const buffer = Buffer.from(base64String, 'base64');
  return buffer;
}

async function deleteAudioFiles(files: string[]) {
  try {
    for (const file of files) {
      await fs.unlink(file);
      console.log(`Arquivo ${file} deletado com sucesso!`);
    }
  } catch (error) {
    console.error('Erro ao deletar os arquivos de áudio:', error);
  }
}

async function generateTranscription(audioPath: string) {
  const response = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file: createReadStream(audioPath)
  })
  .then((transcription) => {
    console.log(transcription);
    return { ok: true, value: transcription.text, reason: null }
  })
  .catch((err) => {
    console.log(err.response.data);
    return { ok: false, value: null, reason: err }
  })

  return response 
}

async function createCompletion(message: string) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [{ role: 'user', content: message }],
      temperature: 0.5,
    });
    return { ok: true, value: completion.choices[0].message?.content, reason: null };
  } catch (err) {
    //@ts-ignore
    const reason = err.response ? err.response.data.error.message : err.message;
    return { ok: false, value: null, reason };
  }
}

client.on('qr', (qr: string) => qrcode.generate(qr, {small: true}) );
client.on('ready', () => console.log('Aplication Running...'));
client.on('message_create', (msg: WAWebJS.Message) => handleMessage(msg))

client.initialize();

async function handleMessage(msg: WAWebJS.Message) {
  if (msg.body.startsWith("!")) {
    const messageWithoutExclamation = msg.body.substring(1)
    const { ok, value, reason } = await createCompletion(messageWithoutExclamation)

    if (ok) {
      msg.reply(`*WhatsGPT*🤖: ${value}`)
      return
    }
    msg.reply(`*Erro*: _${reason}_`)
  }

  if (msg.hasMedia && msg.type === 'ptt') {
    const messageMedia = await msg.downloadMedia();
    if (!messageMedia.mimetype.includes("audio")) {
      return
    }
    
    const audioBuffer = decodeBase64ToBuffer(messageMedia.data);

    const uuid = randomUUID()
    const whatsappAudioPath = resolve(__dirname, '../audios', `${uuid}.ogg`)
    const convertedAudioPath = resolve(__dirname, '../audios', `${uuid}.mp3`)

    await fs.writeFile(whatsappAudioPath, audioBuffer);
    await convertToMp3(whatsappAudioPath, convertedAudioPath)
  
    const { ok, value, reason } = await generateTranscription(convertedAudioPath)
    const transcription = value
    
    if (ok && transcription?.toLowerCase().includes("transcreva")) {
      msg.reply(`*Transcrição*: _${transcription}_`)
    }

    setTimeout(() => {
      deleteAudioFiles([whatsappAudioPath, convertedAudioPath]);
    }, 1000 * 10) //10 seconds
  }
}

async function convertToMp3(inputFilePath: string, outputFilePath: string) {
  const ffmpegCommand = `ffmpeg -i "${inputFilePath}" "${outputFilePath}"`;
  
  await new Promise((resolve, reject) => {
    exec(ffmpegCommand, async (error) => {
      if (error) {
        console.error('Erro ao converter o arquivo:', error);
        return
      }
    })
    setTimeout(() => {
      resolve({})
    }, 2000);
  })
  
}
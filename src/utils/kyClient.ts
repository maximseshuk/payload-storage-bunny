import ky from 'ky'

export const kyClient = ky.create({
  hooks: {
    afterResponse: [
      response => void response.blob(),
    ],
  },
})

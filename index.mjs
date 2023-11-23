import express from 'express'
import axios from 'axios'
import 'dotenv/config'

const app = express()
const $axios = axios.create({
  baseURL: process.env.AMO_URL
})

let tokenData
async function getTokenAndUpdateVariables() {
  try {
    const { data } = await $axios.post('oauth2/access_token', {
      'client_id': process.env.CLIENT_ID,
      'client_secret': process.env.CLIENT_SECRET,
      'grant_type': tokenData ? 'refresh_token' : 'authorization_code',
      [tokenData ? 'refresh_token' : 'code']: tokenData ? tokenData.refresh_token : process.argv.pop(),
      'redirect_uri': process.env.REDIRECT_URL
    })

    update(data)
    setTimeout(() => getTokenAndUpdateVariables(), (data.expires_in - 10) * 1000)
  } catch (e) {
    throw new Error(e.response?.data?.hint ?? e.message)
  }
}

function update(data) {
  tokenData = data
  $axios.defaults.headers['Authorization'] = `${data.token_type} ${data.access_token}`
}

async function getCustomFields() {
  try {
    const { data } = await $axios.get('api/v4/contacts/custom_fields')

    return data._embedded.custom_fields ?? [];
  } catch (e) {
    throw new Error(JSON.stringify(e.response?.data) ?? e.message)
  }
}

async function createOrUpdateContact(id, data) {
  const { name } = data
  const filteredFields = await getEmailAndPhoneFields()
  const customValues = generateCustomValues(filteredFields, data)
  const body = {
    'name': name,
    'custom_fields_values': customValues
  }

  if (id) {
    body.id = id
  }

  try {
    const { data } = await $axios[id ? 'patch' : 'post']('api/v4/contacts', [
      body,
    ])
  
    return data._embedded.contacts.shift()
  } catch (e) {
    throw new Error(JSON.stringify(e.response?.data) ?? e.message)
  }
}

async function getEmailAndPhoneFields() {
  const allCustomFields = await getCustomFields()
  const filteredFields = findFieldsByCode(['PHONE', 'EMAIL'], allCustomFields)
  
  return filteredFields
}

async function getContactById(id) {
  try {
    const { data } = await $axios.get(`api/v4/contacts/${id}?with=leads`)

    return data
  } catch (e) {
    throw new Error(JSON.stringify(e.response?.data) ?? e.message)
  }
}

async function getContacts() {
  try {
    const { data } = await $axios.get(`api/v4/contacts?with=leads`)

    return data
  } catch (e) {
    throw new Error(JSON.stringify(e.response?.data) ?? e.message)
  }
}

async function getContactByQuery(data) {
  const query = JSON.parse(JSON.stringify(data))
  delete query.name

  let params = ``
  for (const value of Object.values(query)) {
    params += `query=${value}&`
  }

  try {
    const { data } = await $axios.get(`api/v4/contacts?${params}`)

    return data?._embedded?.contacts?.shift()
  } catch (e) {
    throw new Error(JSON.stringify(e.response?.data) ?? e.message)
  }
}

async function getLeads() {
  try {
    const { data } = await $axios.get(`api/v4/leads?with=contacts`)

    return data
  } catch (e) {
    throw new Error(JSON.stringify(e.response?.data) ?? e.message)
  }
}

async function getLeadById(id) {
  try {
    const { data } = await $axios.get(`api/v4/leads/${id}?with=contacts`)

    return data
  } catch (e) {
    throw new Error(JSON.stringify(e.response?.data) ?? e.message)
  }
}

async function addLead(contact) {
  try {
    const { data } = await $axios.post('api/v4/leads', [
      {
        'name': `${contact.id} lead`,
        '_embedded': {
          'contacts': [
            {
              'id': contact.id
            }
          ]
        }
      }
    ])

    return data._embedded.leads.shift()
  } catch (e) {
    throw new Error(JSON.stringify(e.response?.data) ?? e.message)
  }
}


function generateCustomValues(fields, data) {
  const { email, phone } = data
  const { PHONE, EMAIL } = fields
  const customValues = []

  if (PHONE && PHONE.id) {
    customValues.push({
      'field_id': PHONE.id,
      'values': [
        {
          'value': phone
        }
      ]
    })
  }
  if (EMAIL && EMAIL.id) {
    customValues.push({
      'field_id': EMAIL.id,
      'values': [
        {
          'value': email
        }
      ]
    })
  }

  return customValues
}

function findFieldsByCode(keys, fields) {
  let response = {}

  for (const key of keys) {
    const exist = fields.find((i) => i.code === key)

    response = Object.assign({
      [key]: exist
    }, response)
  }

  return response;
}

app.get('/', async (req, res) => {
  const { name, email, phone } = req.query;

  if (!name || !email || !phone) {
    return res.status(400).json({
      description: 'Missing parameters'
    })
  }

  const existContact = await getContactByQuery(req.query)
  const freshContact = await createOrUpdateContact(existContact?.id, req.query)
  const lead = await addLead(freshContact)

  res.status(200).json({
    contact: freshContact,
    lead: lead
  })
})

app.get('/contacts', async (req, res) => {
  const contacts = await getContacts()

  res.status(200).json(contacts)
})

app.get('/contacts/:id', async (req, res) => {
  const { id } = req.params;

  if (!id || !Number.isInteger(Number(id))) {
    return res.status(400).json({
      description: 'Wrong ID of contact'
    })
  }

  const contact = await getContactById(Number(id))

  res.status(200).json(contact)
})

app.get('/leads', async (req, res) => {
  const leads = await getLeads()

  res.status(200).json(leads)
})

app.get('/leads/:id', async (req, res) => {
  const { id } = req.params;

  if (!id || !Number.isInteger(Number(id))) {
    return res.status(400).json({
      description: 'Wrong ID of lead'
    })
  }

  const lead = await getLeadById(Number(id))

  res.status(200).json(lead)
})

app.listen(Number(process.env.APP_PORT), async () => {
  await getTokenAndUpdateVariables()
  console.log(`App started at :${process.env.APP_PORT}`)
})
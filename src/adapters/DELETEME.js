import got from 'got'
let data = JSON.stringify({
  "user": "OPENAQ",
  "password": "@mb13nt@l@1R3",
  "startDate": "2024-02-12",
  "endDate": "2023-02-13",
  "idStation": "41"
});

let config = {
  method: 'post',
  url: 'https://sistemas.oefa.gob.pe/openaq/backend/consulta/inf',
  headers: { 
    'Content-Type': 'application/json'
  },
  data : data
};

got.post(config)
.then((response) => {
  console.log(JSON.stringify(response.data));
})
.catch((error) => {
  console.log(error);
});

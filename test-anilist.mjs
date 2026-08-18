import axios from 'axios';

const gql = `{
  Page(page: 1, perPage: 3) {
    media(search: "Jujutsu Kaisen", type: ANIME) {
      id
      idMal
      title { romaji english }
      externalLinks {
        site
        url
      }
    }
  }
}`;

const res = await axios.post('https://graphql.anilist.co', { query: gql });
console.log(JSON.stringify(res.data.data.Page.media, null, 2));

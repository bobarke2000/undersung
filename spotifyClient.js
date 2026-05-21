// Spotify API Client
// Handles authentication and all Spotify API calls

import axios from 'axios';

class SpotifyClient {
  constructor(clientId, clientSecret, redirectUri) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.accessToken = null;
    this.refreshToken = null;
    this.baseUrl = 'https://api.spotify.com/v1';
    this.authUrl = 'https://accounts.spotify.com';
  }

  /**
   * Get authorization URL for user login
   */
  getAuthorizationUrl(scopes = []) {
    const defaultScopes = [
      'user-read-private',
      'user-read-email',
      'user-top-read',
      'user-read-recently-played',
      'user-library-read',
      'playlist-read-private',
      'playlist-modify-public',
      'playlist-modify-private'
    ];

    const scopeString = scopes.length > 0 ? scopes.join(' ') : defaultScopes.join(' ');
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: scopeString,
      show_dialog: 'true'
    });

    return `${this.authUrl}/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForToken(code) {
    try {
      const response = await axios.post(`${this.authUrl}/api/token`, 
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.redirectUri,
          client_id: this.clientId,
          client_secret: this.clientSecret
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;
      return response.data;
    } catch (error) {
      console.error('Error exchanging code for token:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await axios.post(`${this.authUrl}/api/token`,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      if (response.data.refresh_token) {
        this.refreshToken = response.data.refresh_token;
      }
      return response.data;
    } catch (error) {
      console.error('Error refreshing token:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get current user's profile
   */
  async getCurrentUser() {
    return this.get('/me');
  }

  /**
   * Get user's top tracks
   */
  async getUserTopTracks(limit = 50, offset = 0, timeRange = 'long_term') {
    return this.get('/me/top/tracks', { 
      limit, 
      offset,
      time_range: timeRange
    });
  }

  /**
   * Get user's top artists
   */
  async getUserTopArtists(limit = 50, offset = 0, timeRange = 'long_term') {
    return this.get('/me/top/artists', {
      limit,
      offset,
      time_range: timeRange
    });
  }

  /**
   * Get track details
   */
  async getTrack(trackId) {
    return this.get(`/tracks/${trackId}`);
  }

  /**
   * Get multiple tracks
   */
  async getTracks(trackIds) {
    return this.get('/tracks', {
      ids: trackIds.join(',')
    });
  }

  async getUserRecentlyPlayed(limit = 50) {
    return this.get('/me/player/recently-played', { limit });
  }

  async searchByGenre(genre, limit = 10, offset = 0) {
    return this.get('/search', {
      q: `genre:"${genre}"`,
      type: 'track',
      limit,
      offset
    });
  }

  async searchByGenreAndYear(genre, yearRange, limit = 10, offset = 0) {
    return this.get('/search', {
      q: `genre:"${genre}" year:${yearRange}`,
      type: 'track',
      limit,
      offset,
    });
  }

  async searchTracks(query, limit = 10, offset = 0) {
    return this.get('/search', {
      q: query,
      type: 'track',
      limit,
      offset
    });
  }

  /**
   * Get artist details
   */
  async getArtist(artistId) {
    return this.get(`/artists/${artistId}`);
  }

  /**
   * Get artist's top tracks
   */
  async getArtistTopTracks(artistId, market = 'US') {
    return this.get(`/artists/${artistId}/top-tracks`, {
      market
    });
  }

  /**
   * Get related artists
   */
  async getRelatedArtists(artistId) {
    return this.get(`/artists/${artistId}/related-artists`);
  }

  /**
   * Create a playlist
   */
  async createPlaylist(playlistData) {
    return this.post(`/me/playlists`, playlistData);
  }

  /**
   * Add tracks to playlist
   */
  async addTracksToPlaylist(playlistId, trackUris) {
    return this.post(`/playlists/${playlistId}/items`, { uris: trackUris });
  }

  /**
   * Internal GET request
   */
  async get(endpoint, params = {}) {
    return this.request('GET', endpoint, null, params);
  }

  /**
   * Internal POST request
   */
  async post(endpoint, data = {}, params = {}) {
    return this.request('POST', endpoint, data, params);
  }

  /**
   * Internal request handler
   */
  async request(method, endpoint, data = null, params = {}, _retry = 0) {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Please authorize first.');
    }

    try {
      const url = `${this.baseUrl}${endpoint}`;
      const config = {
        method,
        url,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        params
      };

      if (data) {
        config.data = data;
      }

      const response = await axios({ ...config, timeout: 8000 });
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        try {
          await this.refreshAccessToken();
          return this.request(method, endpoint, data, params, _retry);
        } catch (refreshError) {
          throw new Error('Authentication failed. Please re-authorize.');
        }
      }
      throw error;
    }
  }
}

export default SpotifyClient;
